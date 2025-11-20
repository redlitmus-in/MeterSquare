import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  AlertCircle,
  BarChart3
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import { technicalDirectorService } from '../services/technicalDirectorService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

const TechnicalDirectorDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);

  // ✅ PERFORMANCE: Fetch dashboard data on mount
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const result = await technicalDirectorService.getDashboardStats();

        if (result.success && result.data) {
          setDashboardData(result.data);
        } else {
          toast.error(result.message || 'Failed to fetch dashboard data');
        }
      } catch (error: any) {
        console.error('Error fetching dashboard data:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // ✅ PERFORMANCE: Memoize chart configurations to prevent unnecessary re-renders
  const projectStatusChart = useMemo(() => {
    if (!dashboardData?.projectStatus) return null;

    const { in_progress, completed, pending, delayed } = dashboardData.projectStatus;

    return {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      title: {
        text: 'BOQ Status Overview',
        style: {
          fontSize: '16px',
          fontWeight: '600'
        }
      },
      xAxis: {
        categories: ['Revisions', 'Approved', 'Pending Approval', 'Rejected by TD'],
        labels: {
          style: {
            fontSize: '11px'
          }
        }
      },
      yAxis: {
        title: {
          text: 'Number of BOQs',
          style: {
            fontSize: '12px'
          }
        }
      },
      series: [{
        name: 'BOQs',
        data: [in_progress, completed, pending, delayed],
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, '#ef4444'],
            [1, '#fca5a5']
          ]
        },
        borderRadius: 8
      }],
      plotOptions: {
        column: {
          borderWidth: 0,
          dataLabels: {
            enabled: true,
            style: {
              fontSize: '11px',
              fontWeight: 'bold'
            }
          }
        }
      },
      legend: {
        enabled: false
      },
      credits: {
        enabled: false
      }
    };
  }, [dashboardData?.projectStatus]);

  const budgetDistributionChart = useMemo(() => {
    if (!dashboardData?.budgetDistribution) return null;

    const budgetData = Object.entries(dashboardData.budgetDistribution).map(([name, y], index) => {
      const colors = ['#ef4444', '#f87171', '#fca5a5', '#fecaca'];
      return {
        name,
        y: y as number,
        color: colors[index % colors.length]
      };
    });

    return {
      chart: {
        type: 'pie',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      title: {
        text: 'Budget Distribution',
        style: {
          fontSize: '16px',
          fontWeight: '600'
        }
      },
      plotOptions: {
        pie: {
          innerSize: '60%',
          dataLabels: {
            enabled: true,
            format: '{point.name}: {point.percentage:.1f}%',
            style: {
              fontSize: '11px'
            }
          }
        }
      },
      series: [{
        name: 'Budget',
        data: budgetData
      }],
      credits: {
        enabled: false
      }
    };
  }, [dashboardData?.budgetDistribution]);

  const performanceLineChart = useMemo(() => {
    if (!dashboardData?.monthlyPerformance || !dashboardData?.performanceMonthLabels) return null;

    return {
      chart: {
        type: 'area',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      title: {
        text: 'Monthly Performance Trend (Last 12 Months)',
        style: {
          fontSize: '16px',
          fontWeight: '600'
        }
      },
      xAxis: {
        categories: dashboardData.performanceMonthLabels,
        labels: {
          style: {
            fontSize: '11px'
          }
        }
      },
      yAxis: {
        title: {
          text: 'Success Rate (%)',
          style: {
            fontSize: '12px'
          }
        }
      },
      series: [{
        name: 'Success Rate',
        data: dashboardData.monthlyPerformance,
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, 'rgba(239, 68, 68, 0.4)'],
            [1, 'rgba(239, 68, 68, 0.1)']
          ]
        },
        color: '#ef4444',
        marker: {
          radius: 3,
          fillColor: '#ffffff',
          lineWidth: 2,
          lineColor: '#ef4444'
        }
      }],
      legend: {
        enabled: false
      },
      credits: {
        enabled: false
      }
    };
  }, [dashboardData?.monthlyPerformance, dashboardData?.performanceMonthLabels]);

  const revenueGrowthChart = useMemo(() => {
    if (!dashboardData?.quarterlyRevenue) return null;

    return {
      chart: {
        type: 'spline',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      title: {
        text: 'Revenue Growth',
        style: {
          fontSize: '16px',
          fontWeight: '600'
        }
      },
      xAxis: {
        categories: ['Q1', 'Q2', 'Q3', 'Q4'],
        labels: {
          style: {
            fontSize: '11px'
          }
        }
      },
      yAxis: {
        title: {
          text: 'Revenue (in Lakhs)',
          style: {
            fontSize: '12px'
          }
        }
      },
      series: [{
        name: '2023',
        data: dashboardData.quarterlyRevenue.previous_year,
        color: '#fca5a5',
        marker: {
          symbol: 'circle'
        }
      }, {
        name: '2024',
        data: dashboardData.quarterlyRevenue.current_year,
        color: '#ef4444',
        marker: {
          symbol: 'diamond'
        }
      }],
      plotOptions: {
        spline: {
          lineWidth: 3,
          marker: {
            enabled: true,
            radius: 4
          }
        }
      },
      credits: {
        enabled: false
      }
    };
  }, [dashboardData?.quarterlyRevenue]);

  // ✅ NEW: BOQ Status Distribution Chart
  const boqStatusChart = useMemo(() => {
    if (!dashboardData?.boqStatusDistribution) return null;

    const statusData = Object.entries(dashboardData.boqStatusDistribution).map(([name, y], index) => {
      const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
      return {
        name,
        y: y as number,
        color: colors[index % colors.length]
      };
    });

    return {
      chart: {
        type: 'pie',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      title: {
        text: 'BOQ Status Distribution',
        style: {
          fontSize: '16px',
          fontWeight: '600'
        }
      },
      plotOptions: {
        pie: {
          innerSize: '60%',
          dataLabels: {
            enabled: true,
            format: '{point.name}: {point.y}',
            style: {
              fontSize: '11px'
            }
          }
        }
      },
      series: [{
        name: 'BOQs',
        data: statusData
      }],
      credits: {
        enabled: false
      }
    };
  }, [dashboardData?.boqStatusDistribution]);

  // ✅ NEW: Top Projects Chart
  const topProjectsChart = useMemo(() => {
    if (!dashboardData?.topProjects || dashboardData.topProjects.length === 0) return null;

    const projectNames = dashboardData.topProjects.map((p: any) => p.name);
    const projectBudgets = dashboardData.topProjects.map((p: any) => p.budget / 100000); // Convert to lakhs

    return {
      chart: {
        type: 'bar',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      title: {
        text: 'Top 5 Projects by Budget',
        style: {
          fontSize: '16px',
          fontWeight: '600'
        }
      },
      xAxis: {
        categories: projectNames,
        labels: {
          style: {
            fontSize: '11px'
          }
        }
      },
      yAxis: {
        title: {
          text: 'Budget (in Lakhs)',
          style: {
            fontSize: '12px'
          }
        }
      },
      series: [{
        name: 'Budget',
        data: projectBudgets,
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 1, y2: 0 },
          stops: [
            [0, '#3b82f6'],
            [1, '#93c5fd']
          ]
        },
        borderRadius: 8
      }],
      plotOptions: {
        bar: {
          borderWidth: 0,
          dataLabels: {
            enabled: true,
            format: '{y:.1f}L',
            style: {
              fontSize: '11px',
              fontWeight: 'bold'
            }
          }
        }
      },
      legend: {
        enabled: false
      },
      credits: {
        enabled: false
      }
    };
  }, [dashboardData?.topProjects]);

  // ✅ NEW: Monthly Revenue Trend Chart
  const monthlyRevenueChart = useMemo(() => {
    if (!dashboardData?.monthlyRevenue || !dashboardData?.monthLabels) return null;

    return {
      chart: {
        type: 'line',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      title: {
        text: 'Monthly Revenue Trend (Last 6 Months)',
        style: {
          fontSize: '16px',
          fontWeight: '600'
        }
      },
      xAxis: {
        categories: dashboardData.monthLabels,
        labels: {
          style: {
            fontSize: '11px'
          }
        }
      },
      yAxis: {
        title: {
          text: 'Revenue (in Lakhs)',
          style: {
            fontSize: '12px'
          }
        }
      },
      series: [{
        name: 'Revenue',
        data: dashboardData.monthlyRevenue,
        color: '#10b981',
        marker: {
          radius: 4,
          fillColor: '#ffffff',
          lineWidth: 2,
          lineColor: '#10b981'
        }
      }],
      plotOptions: {
        line: {
          lineWidth: 3,
          dataLabels: {
            enabled: true,
            format: '{y}L',
            style: {
              fontSize: '10px',
              fontWeight: 'bold'
            }
          }
        }
      },
      legend: {
        enabled: false
      },
      credits: {
        enabled: false
      }
    };
  }, [dashboardData?.monthlyRevenue, dashboardData?.monthLabels]);

  // ✅ NEW: Top Estimators Chart
  const topEstimatorsChart = useMemo(() => {
    if (!dashboardData?.topEstimators || dashboardData.topEstimators.length === 0) return null;

    const estimatorNames = dashboardData.topEstimators.map((e: any) => e.name);
    const estimatorCounts = dashboardData.topEstimators.map((e: any) => e.count);

    return {
      chart: {
        type: 'column',
        backgroundColor: 'transparent',
        style: {
          fontFamily: 'inherit'
        }
      },
      title: {
        text: 'Top 5 Estimators by BOQ Count',
        style: {
          fontSize: '16px',
          fontWeight: '600'
        }
      },
      xAxis: {
        categories: estimatorNames,
        labels: {
          style: {
            fontSize: '11px'
          }
        }
      },
      yAxis: {
        title: {
          text: 'Number of BOQs',
          style: {
            fontSize: '12px'
          }
        }
      },
      series: [{
        name: 'BOQs Created',
        data: estimatorCounts,
        color: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, '#8b5cf6'],
            [1, '#c4b5fd']
          ]
        },
        borderRadius: 8
      }],
      plotOptions: {
        column: {
          borderWidth: 0,
          dataLabels: {
            enabled: true,
            style: {
              fontSize: '11px',
              fontWeight: 'bold'
            }
          }
        }
      },
      legend: {
        enabled: false
      },
      credits: {
        enabled: false
      }
    };
  }, [dashboardData?.topEstimators]);

  // ✅ PERFORMANCE: Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <ModernLoadingSpinners size="xl" className="mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // ✅ PERFORMANCE: Show error state if no data
  if (!dashboardData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <p className="text-gray-600">Failed to load dashboard data</p>
        </div>
      </div>
    );
  }

  const activeProjects = dashboardData.activeProjects || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
              <BarChart3 className="w-6 h-6 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-[#243d8a]">Technical Director Dashboard</h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Top Row - 4 Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {projectStatusChart && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6"
            >
              <HighchartsReact highcharts={Highcharts} options={projectStatusChart} />
            </motion.div>
          )}

          {budgetDistributionChart && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6"
            >
              <HighchartsReact highcharts={Highcharts} options={budgetDistributionChart} />
            </motion.div>
          )}

          {boqStatusChart && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-2xl shadow-lg border border-green-100 p-6"
            >
              <HighchartsReact highcharts={Highcharts} options={boqStatusChart} />
            </motion.div>
          )}

          {performanceLineChart && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6"
            >
              <HighchartsReact highcharts={Highcharts} options={performanceLineChart} />
            </motion.div>
          )}
        </div>

        {/* Middle Row - 3 Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {topProjectsChart && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6"
            >
              <HighchartsReact highcharts={Highcharts} options={topProjectsChart} />
            </motion.div>
          )}

          {monthlyRevenueChart && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-white rounded-2xl shadow-lg border border-green-100 p-6"
            >
              <HighchartsReact highcharts={Highcharts} options={monthlyRevenueChart} />
            </motion.div>
          )}

          {topEstimatorsChart && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="bg-white rounded-2xl shadow-lg border border-purple-100 p-6"
            >
              <HighchartsReact highcharts={Highcharts} options={topEstimatorsChart} />
            </motion.div>
          )}
        </div>

        {/* Bottom Row - Revenue Growth */}
        {revenueGrowthChart && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6 mb-8"
          >
            <HighchartsReact highcharts={Highcharts} options={revenueGrowthChart} />
          </motion.div>
        )}

        {/* Active Projects Grid */}
        {activeProjects.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
          >
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
              Active Projects Overview
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {activeProjects.map((project: any, index: number) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className="bg-white rounded-2xl border border-blue-100 p-5 hover:shadow-lg transition-all"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-gray-900">{project.name}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      project.status === 'on-track'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {project.status === 'on-track' ? 'On Track' : 'Delayed'}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Project Manager</p>
                      <p className="font-medium text-gray-900">{project.pm}</p>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">Progress</span>
                        <span className="font-medium text-gray-900">{project.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            project.status === 'on-track'
                              ? 'bg-gradient-to-r from-green-400 to-green-600'
                              : 'bg-gradient-to-r from-red-400 to-red-600'
                          }`}
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between pt-2 border-t border-gray-100">
                      <div>
                        <p className="text-xs text-gray-500">Budget Used</p>
                        <p className="font-medium text-gray-900">AED{(project.spent / 100000).toFixed(1)}L</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Due Date</p>
                        <p className="font-medium text-gray-900">{project.dueDate || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(TechnicalDirectorDashboard);
