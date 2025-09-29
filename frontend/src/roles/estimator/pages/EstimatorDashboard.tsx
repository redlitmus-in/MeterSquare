import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  FileText,
  AlertCircle,
  Eye,
  Edit,
  ThumbsUp,
  BarChart3,
  Send,
  Plus,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { estimatorService } from '../services/estimatorService';
import { BOQ, BOQDashboardMetrics } from '../types';
import BOQCreationForm from '@/components/forms/BOQCreationForm';
import BOQDetailsModal from '../components/BOQDetailsModal';
import BOQEditModal from '../components/BOQEditModal';

const EstimatorDashboard: React.FC = () => {
  // State management
  const [selectedBoq, setSelectedBoq] = useState<BOQ | null>(null);
  const [isCreatingBoq, setIsCreatingBoq] = useState(false);
  const [showBoqDetails, setShowBoqDetails] = useState(false);
  const [editingBoq, setEditingBoq] = useState<BOQ | null>(null);
  const [showBoqEdit, setShowBoqEdit] = useState(false);
  const [pendingBoqs, setPendingBoqs] = useState<BOQ[]>([]);
  const [activeBoqs, setActiveBoqs] = useState<BOQ[]>([]);
  const [metrics, setMetrics] = useState<BOQDashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        loadBOQs(),
        loadMetrics()
      ]);
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadBOQs = async () => {
    try {
      // Get all BOQs
      const result = await estimatorService.getAllBOQs();
      if (result.success) {
        // Filter pending BOQs (draft status)
        const pending = result.data.filter(boq => boq.status === 'draft' || boq.status === 'pending');
        setPendingBoqs(pending);

        // Filter active BOQs (approved, sent_for_confirmation, rejected)
        const active = result.data.filter(boq =>
          ['approved', 'sent_for_confirmation', 'rejected'].includes(boq.status)
        );
        setActiveBoqs(active);
      }
    } catch (error) {
      console.error('Failed to load BOQs:', error);
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDashboardData();
    setIsRefreshing(false);
    toast.success('Dashboard refreshed');
  };

  const handleSubmitBOQ = async (boqId: number) => {
    try {
      const result = await estimatorService.sendBOQForConfirmation(boqId);
      if (result.success) {
        toast.success(result.message);
        await loadBOQs(); // Refresh the list
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to submit BOQ');
    }
  };

  const handleEditBOQ = (boq: BOQ) => {
    setEditingBoq(boq);
    setShowBoqEdit(true);
  };

  const handleViewBOQ = (boq: BOQ) => {
    setSelectedBoq(boq);
    setShowBoqDetails(true);
  };

  const handleBOQSaved = () => {
    loadBOQs(); // Refresh the list
    setShowBoqEdit(false);
    setEditingBoq(null);
  };

  const handleBOQCreated = () => {
    toast.success('BOQ created successfully!');
    setIsCreatingBoq(false);
    loadBOQs(); // Refresh the list
  };

  // Generate charts based on real data
  const generateChartsFromData = () => {
    if (!metrics) return null;

    const projectsByStatusChart = {
      chart: {
        type: 'pie',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      title: {
        text: 'BOQs by Status',
        align: 'left',
        style: {
          fontSize: '18px',
          fontWeight: '600',
          color: '#1f2937'
        }
      },
      plotOptions: {
        pie: {
          innerSize: '50%',
          size: '75%',
          dataLabels: {
            enabled: true,
            distance: 30,
            connectorWidth: 2,
            connectorPadding: 5,
            format: '<b>{point.name}:</b><br/>{point.y}',
            style: {
              fontSize: '12px',
              fontWeight: '600',
              textOutline: 'none',
              color: '#1f2937'
            }
          }
        }
      },
      series: [{
        name: 'BOQs',
        data: [
          { name: 'Pending', y: metrics.pendingBOQs, color: '#f59e0b' },
          { name: 'Approved', y: metrics.approvedBOQs, color: '#10b981' },
          { name: 'In Review', y: Math.max(0, metrics.totalBOQs - metrics.pendingBOQs - metrics.approvedBOQs), color: '#6366f1' }
        ]
      }],
      credits: {
        enabled: false
      },
      legend: {
        enabled: false
      }
    };

    const budgetUtilizationChart = {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      title: {
        text: 'Monthly BOQ Value',
        align: 'left',
        style: {
          fontSize: '18px',
          fontWeight: '600',
          color: '#1f2937'
        }
      },
      xAxis: {
        categories: metrics.monthlyTrend.map(item => item.month),
        labels: {
          style: {
            fontSize: '12px',
            color: '#6b7280'
          }
        },
        gridLineWidth: 0
      },
      yAxis: {
        title: {
          text: 'Value (Lakhs)',
          style: {
            fontSize: '12px',
            color: '#6b7280'
          }
        },
        gridLineColor: '#e5e7eb',
        gridLineDashStyle: 'Dot'
      },
      plotOptions: {
        column: {
          grouping: true,
          borderRadius: 4,
          borderWidth: 0,
          dataLabels: {
            enabled: false
          }
        }
      },
      series: [{
        name: 'BOQ Value',
        data: metrics.monthlyTrend.map(item => Math.round(item.value / 100000)), // Convert to lakhs
        color: '#6366f1'
      }],
      legend: {
        enabled: false
      },
      credits: {
        enabled: false
      }
    };

    const progressTimelineChart = {
      chart: {
        type: 'spline',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      title: {
        text: 'BOQ Creation Trend',
        align: 'left',
        style: {
          fontSize: '18px',
          fontWeight: '600',
          color: '#1f2937'
        }
      },
      xAxis: {
        categories: metrics.monthlyTrend.map(item => item.month),
        labels: {
          style: {
            fontSize: '12px',
            color: '#6b7280'
          }
        },
        gridLineWidth: 0
      },
      yAxis: {
        title: {
          text: 'Number of BOQs',
          style: {
            fontSize: '12px',
            color: '#6b7280'
          }
        },
        min: 0,
        gridLineColor: '#e5e7eb',
        gridLineDashStyle: 'Dot'
      },
      plotOptions: {
        spline: {
          lineWidth: 3,
          marker: {
            enabled: true,
            radius: 4
          }
        }
      },
      series: [{
        name: 'BOQs Created',
        data: metrics.monthlyTrend.map(item => item.count),
        color: '#60a5fa'
      }],
      legend: {
        enabled: false
      },
      credits: {
        enabled: false
      }
    };

    return { projectsByStatusChart, budgetUtilizationChart, progressTimelineChart };
  };

  const charts = generateChartsFromData();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="text-lg font-medium text-gray-700">Loading Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Simple Header with Blue Gradient */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-blue-900">Estimator Dashboard</h1>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 hover:text-blue-800 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingBoq(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create BOQ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Metrics Cards */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl shadow-md p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total BOQs</p>
                  <p className="text-2xl font-bold text-gray-900">{metrics.totalBOQs}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl shadow-md p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600">{metrics.pendingBOQs}</p>
                </div>
                <div className="p-3 bg-yellow-100 rounded-full">
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-xl shadow-md p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Approved</p>
                  <p className="text-2xl font-bold text-green-600">{metrics.approvedBOQs}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <ThumbsUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-xl shadow-md p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Value</p>
                  <p className="text-2xl font-bold text-gray-900">₹{(metrics.totalProjectValue / 100000).toFixed(1)}L</p>
                </div>
                <div className="p-3 bg-indigo-100 rounded-full">
                  <BarChart3 className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Charts Section - 3 charts as per design */}
        {charts && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-xl shadow-md p-6">
              <HighchartsReact highcharts={Highcharts} options={charts.projectsByStatusChart} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-xl shadow-md p-6">
              <HighchartsReact highcharts={Highcharts} options={charts.budgetUtilizationChart} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-xl shadow-md p-6">
              <HighchartsReact highcharts={Highcharts} options={charts.progressTimelineChart} />
            </motion.div>
          </div>
        )}

        {/* Pending BOQ Submissions Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg">
                <AlertCircle className="w-6 h-6 text-blue-600" />
              </div>
              Pending BOQ Submissions
            </h2>
            <span className="text-sm text-gray-500">{pendingBoqs.length} pending</span>
          </div>

          {pendingBoqs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No pending BOQs</p>
              <p className="text-sm text-gray-400 mt-1">All BOQs have been submitted for review</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingBoqs.map((boq, index) => (
                <motion.div
                  key={boq.boq_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="bg-white rounded-2xl border border-blue-100 p-6 hover:shadow-lg transition-all hover:border-blue-300 hover:shadow-blue-100/50">

                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">{boq.title || boq.boq_name || `BOQ #${boq.boq_id}`}</h3>
                        <p className="text-sm text-gray-500">BOQ ID: {boq.boq_id}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${
                      boq.status === 'draft' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                      boq.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                      'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {boq.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  {/* Content Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1 font-medium">Project</p>
                      <p className="font-semibold text-gray-900 text-sm">{boq.project?.name || 'Unknown Project'}</p>
                    </div>
                    <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1 font-medium">Client</p>
                      <p className="font-semibold text-gray-900 text-sm">{boq.project?.client || 'Unknown Client'}</p>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg p-3">
                      <p className="text-xs text-green-600 mb-1 font-medium">Project Value</p>
                      <p className="font-bold text-green-700 text-sm">
                        {boq.summary?.grandTotal ? `₹${(boq.summary.grandTotal / 100000).toFixed(1)}L` : 'N/A'}
                      </p>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-3">
                      <p className="text-xs text-blue-600 mb-1 font-medium">Created</p>
                      <p className="font-semibold text-blue-700 text-sm">
                        {boq.created_at ? new Date(boq.created_at).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleViewBOQ(boq)}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
                        title="View BOQ Details">
                        <Eye className="w-4 h-4" />
                        <span>View Details</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditBOQ(boq)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors font-medium"
                        title="Edit BOQ">
                        <Edit className="w-4 h-4" />
                        <span>Edit BOQ</span>
                      </button>
                    </div>
                    {boq.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => handleSubmitBOQ(boq.boq_id!)}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
                        title="Submit BOQ for Review">
                        <Send className="w-4 h-4" />
                        <span>Submit</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recent BOQ Reviews Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}>
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg">
              <BarChart3 className="w-6 h-6 text-blue-600" />
            </div>
            Recent BOQ Reviews
          </h2>

          {activeBoqs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No BOQ reviews yet</p>
              <p className="text-sm text-gray-400 mt-1">Submitted BOQs will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {activeBoqs.map((boq, index) => (
                <motion.div
                  key={boq.boq_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="bg-white rounded-2xl border border-blue-100 p-5 hover:shadow-lg transition-all cursor-pointer group"
                  onClick={() => handleViewBOQ(boq)}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">{boq.title || boq.boq_name || `BOQ #${boq.boq_id}`}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      boq.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : boq.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {boq.status === 'approved' ? 'Approved' : boq.status === 'rejected' ? 'Rejected' : 'In Review'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Project</p>
                      <p className="font-medium text-gray-900">{boq.project?.name || 'Unknown Project'}</p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500 mb-1">Client</p>
                      <p className="font-medium text-gray-900">{boq.project?.client || 'Unknown Client'}</p>
                    </div>

                    <div className="flex justify-between pt-2 border-t border-gray-100">
                      <div>
                        <p className="text-xs text-gray-500">BOQ Value</p>
                        <p className="font-medium text-gray-900">
                          {boq.summary?.grandTotal ? `₹${(boq.summary.grandTotal / 100000).toFixed(1)}L` : 'N/A'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Status Updated</p>
                        <p className="font-medium text-gray-900">
                          {boq.last_modified_at ? new Date(boq.last_modified_at).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-blue-600 group-hover:text-blue-700 transition-colors">
                      <Eye className="w-4 h-4" />
                      <span className="text-sm font-medium">View Details</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* BOQ Creation Modal */}
      <BOQCreationForm
        isOpen={isCreatingBoq}
        onClose={() => setIsCreatingBoq(false)}
        onSubmit={handleBOQCreated}
      />

      {/* BOQ Details Modal */}
      <BOQDetailsModal
        isOpen={showBoqDetails}
        onClose={() => {
          setShowBoqDetails(false);
          setSelectedBoq(null);
        }}
        boq={selectedBoq}
        onEdit={() => {
          if (selectedBoq) {
            setShowBoqDetails(false);
            handleEditBOQ(selectedBoq);
          }
        }}
        onDownload={() => {
          toast.info('BOQ download feature will be implemented soon');
        }}
      />

      {/* BOQ Edit Modal */}
      <BOQEditModal
        isOpen={showBoqEdit}
        onClose={() => {
          setShowBoqEdit(false);
          setEditingBoq(null);
        }}
        boq={editingBoq}
        onSave={handleBOQSaved}
      />
    </div>
  );
};

export default EstimatorDashboard;