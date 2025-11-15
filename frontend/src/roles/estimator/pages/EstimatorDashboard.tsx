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
  DollarSign,
  Eye,
  Building2,
  Users,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { estimatorService } from '../services/estimatorService';
import { BOQ, BOQDashboardMetrics } from '../types';
import BOQCreationForm from '@/components/forms/BOQCreationForm';
import BOQDetailsModal from '../components/BOQDetailsModal';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { format } from 'date-fns';

const EstimatorDashboard: React.FC = () => {
  // State management
  const [isCreatingBoq, setIsCreatingBoq] = useState(false);
  const [metrics, setMetrics] = useState<BOQDashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recentBoqs, setRecentBoqs] = useState<BOQ[]>([]);
  const [selectedBoq, setSelectedBoq] = useState<BOQ | null>(null);
  const [showBoqDetails, setShowBoqDetails] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadMetrics(), loadRecentBoqs()]);
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const result = await estimatorService.getDashboardMetrics();
      if (result.success && result.data) {
        setMetrics(result.data);
      }
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  };

  const loadRecentBoqs = async () => {
    try {
      const result = await estimatorService.getAllBOQs();
      if (result.success) {
        const mapped = result.data.map((boq: any) => ({
          ...boq,
          boq_id: boq.boq_id,
          title: boq.boq_name || boq.title || 'Unnamed BOQ',
          project: {
            project_id: boq.project_id,
            name: boq.project_name || 'Unknown Project',
            client: boq.client || 'Unknown Client',
            location: boq.location || 'Unknown Location'
          },
          summary: {
            grandTotal: boq.total_cost || boq.selling_price || 0
          },
          total_cost: boq.total_cost || 0,
          status: boq.status || 'draft',
          created_at: boq.created_at
        }));
        setRecentBoqs(mapped.slice(0, 6)); // Get latest 6
      }
    } catch (error) {
      console.error('Failed to load BOQs:', error);
    }
  };

  const handleBOQCreated = () => {
    toast.success('BOQ created successfully!');
    setIsCreatingBoq(false);
    loadDashboardData();
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'approved': return 'bg-green-100 text-green-700 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
      case 'draft': return 'bg-gray-100 text-gray-700 border-gray-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  // Chart configurations - Exact same as TD
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
        { name: 'Pending', y: metrics?.pendingBOQs || 0, color: '#f59e0b' },
        { name: 'Approved', y: metrics?.approvedBOQs || 0, color: '#10b981' },
        { name: 'Sent', y: metrics?.sentForConfirmation || 0, color: '#3b82f6' },
        { name: 'Rejected', y: metrics?.rejectedBOQs || 0, color: '#ef4444' }
      ]
    }],
    plotOptions: {
      pie: {
        innerSize: '60%',
        dataLabels: {
          enabled: true,
          distance: 20,
          format: '{point.name}: {point.y}',
          style: {
            fontSize: '13px',
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

  const budgetUtilizationChart = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Budget Utilization',
      align: 'center',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: metrics?.monthlyTrend?.map(item => item.month) || ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        }
      }
    },
    yAxis: {
      title: {
        text: 'Amount (Lakhs)',
        style: {
          fontSize: '12px',
          color: '#6b7280'
        }
      },
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        }
      }
    },
    series: [{
      name: 'Budget',
      data: metrics?.monthlyTrend?.map(item => (item.value / 100000) * 1.3) || [50, 80, 40, 120, 15, 60],
      color: '#ddd6fe'
    }, {
      name: 'Spent',
      data: metrics?.monthlyTrend?.map(item => item.value / 100000) || [35, 70, 35, 90, 12, 58],
      color: '#6366f1'
    }],
    plotOptions: {
      column: {
        borderRadius: 5,
        dataLabels: { enabled: false }
      }
    },
    legend: {
      enabled: true,
      align: 'center',
      verticalAlign: 'bottom',
      itemStyle: {
        fontSize: '12px',
        fontWeight: '500'
      }
    },
    credits: { enabled: false }
  };

  const progressTimelineChart = {
    chart: {
      type: 'spline',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Progress Timeline',
      align: 'center',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: metrics?.monthlyTrend?.map(item => item.month) || ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        }
      }
    },
    yAxis: {
      title: {
        text: 'Progress %',
        style: {
          fontSize: '12px',
          color: '#6b7280'
        }
      },
      max: 100,
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        }
      }
    },
    series: [{
      name: 'Tech',
      data: [20, 40, 60, 70, 80, 75],
      color: '#3b82f6'
    }, {
      name: 'Mall',
      data: [25, 35, 45, 60, 50, 48],
      color: '#10b981'
    }, {
      name: 'Hospital',
      data: [15, 30, 50, 65, 85, 90],
      color: '#f59e0b'
    }],
    plotOptions: {
      spline: {
        lineWidth: 3,
        marker: {
          enabled: false,
          radius: 4
        }
      }
    },
    legend: {
      enabled: true,
      align: 'center',
      verticalAlign: 'bottom',
      itemStyle: {
        fontSize: '12px',
        fontWeight: '500'
      }
    },
    credits: { enabled: false }
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
      {/* Header - Red Soft Gradient */}
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
        {/* Summary Stats - Exact TD Style */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total BOQs</p>
                <p className="text-2xl font-bold text-gray-900">{metrics?.totalBOQs || 0}</p>
              </div>
              <FileText className="w-8 h-8 text-purple-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md border border-green-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Approved</p>
                <p className="text-2xl font-bold text-green-600">
                  {metrics?.approvedBOQs || 0}
                </p>
              </div>
              <ThumbsUp className="w-8 h-8 text-green-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-md border border-red-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending</p>
                <p className="text-2xl font-bold text-red-600">
                  {metrics?.pendingBOQs || 0}
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-md border border-blue-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Value</p>
                <p className="text-2xl font-bold text-gray-900">AED {metrics?.totalValue ? (metrics.totalValue / 1000000).toFixed(1) : '0'}M</p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-500" />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-xl shadow-md border border-orange-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">This Month</p>
                <p className="text-2xl font-bold text-gray-900">{metrics?.monthlyTrend?.[metrics.monthlyTrend.length - 1]?.count || 0}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-500" />
            </div>
          </motion.div>
        </div>

        {/* Charts - Exact TD Style */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <HighchartsReact.default highcharts={Highcharts} options={projectStatusChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <HighchartsReact.default highcharts={Highcharts} options={budgetUtilizationChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <HighchartsReact.default highcharts={Highcharts} options={progressTimelineChart} />
          </motion.div>
        </div>

        {/* Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Monthly Performance */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-4">Monthly Performance</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">BOQ Approval Rate</span>
                  <span className="font-semibold text-green-600">
                    {metrics?.approvedBOQs && metrics?.totalBOQs
                      ? Math.round((metrics.approvedBOQs / metrics.totalBOQs) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-green-400 to-green-600"
                    style={{
                      width: `${metrics?.approvedBOQs && metrics?.totalBOQs
                        ? (metrics.approvedBOQs / metrics.totalBOQs) * 100
                        : 0}%`
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Pending Review</span>
                  <span className="font-semibold text-green-600">
                    {metrics?.pendingBOQs && metrics?.totalBOQs
                      ? Math.round((metrics.pendingBOQs / metrics.totalBOQs) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-green-300 to-green-500"
                    style={{
                      width: `${metrics?.pendingBOQs && metrics?.totalBOQs
                        ? (metrics.pendingBOQs / metrics.totalBOQs) * 100
                        : 0}%`
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Rejected/Revision</span>
                  <span className="font-semibold text-red-500">
                    {metrics?.rejectedBOQs && metrics?.totalBOQs
                      ? Math.round((metrics.rejectedBOQs / metrics.totalBOQs) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-orange-300 to-red-400"
                    style={{
                      width: `${metrics?.rejectedBOQs && metrics?.totalBOQs
                        ? (metrics.rejectedBOQs / metrics.totalBOQs) * 100
                        : 0}%`
                    }}
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Project Statistics */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">Total BOQs</span>
                </div>
                <p className="text-3xl font-bold text-blue-900">{metrics?.totalBOQs || 0}</p>
                <p className="text-xs text-blue-700 mt-1">All time</p>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <ThumbsUp className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-900">Approved</span>
                </div>
                <p className="text-3xl font-bold text-green-900">{metrics?.approvedBOQs || 0}</p>
                <p className="text-xs text-green-700 mt-1">This month</p>
              </div>

              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-900">Pending</span>
                </div>
                <p className="text-3xl font-bold text-yellow-900">{metrics?.pendingBOQs || 0}</p>
                <p className="text-xs text-yellow-700 mt-1">Awaiting review</p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                  <span className="text-sm font-medium text-purple-900">Avg Value</span>
                </div>
                <p className="text-3xl font-bold text-purple-900">
                  {metrics?.totalValue && metrics?.totalBOQs
                    ? Math.round(metrics.totalValue / metrics.totalBOQs / 1000)
                    : 0}K
                </p>
                <p className="text-xs text-purple-700 mt-1">Per BOQ</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* BOQ Creation Modal */}
      <BOQCreationForm
        isOpen={isCreatingBoq}
        onClose={() => setIsCreatingBoq(false)}
        onSubmit={handleBOQCreated}
        hideTemplate={true}
      />

      {/* BOQ Details Modal */}
      <BOQDetailsModal
        isOpen={showBoqDetails}
        onClose={() => {
          setShowBoqDetails(false);
          setSelectedBoq(null);
        }}
        boq={selectedBoq}
        onEdit={() => {}}
        onDownload={() => {
          toast.info('BOQ download feature will be implemented soon');
        }}
      />
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (577 lines)
export default React.memo(EstimatorDashboard);