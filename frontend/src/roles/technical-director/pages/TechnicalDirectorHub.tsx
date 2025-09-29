import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  AlertCircle,
  Eye,
  ThumbsUp,
  ThumbsDown,
  BarChart3
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

const TechnicalDirectorDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [selectedProject, setSelectedProject] = useState<any>(null);

  // Pending approvals data
  const pendingApprovals = [
    {
      id: 1,
      projectName: 'Corporate Office - 5th Floor',
      estimator: 'John Doe',
      value: 3440000,
      items: 45,
      submittedDate: '2024-01-15',
      priority: 'high',
      profitMargin: 28
    },
    {
      id: 2,
      projectName: 'Retail Store Renovation',
      estimator: 'Jane Smith',
      value: 1250000,
      items: 23,
      submittedDate: '2024-01-14',
      priority: 'medium',
      profitMargin: 22
    },
    {
      id: 3,
      projectName: 'Restaurant Interior',
      estimator: 'Mike Johnson',
      value: 890000,
      items: 18,
      submittedDate: '2024-01-13',
      priority: 'low',
      profitMargin: 25
    }
  ];

  // Active projects overview
  const activeProjects = [
    {
      id: 1,
      name: 'Tech Park Building A',
      pm: 'Sarah Wilson',
      progress: 65,
      budget: 5600000,
      spent: 3640000,
      status: 'on-track',
      dueDate: '2024-02-28'
    },
    {
      id: 2,
      name: 'Mall Extension Project',
      pm: 'Robert Brown',
      progress: 42,
      budget: 8900000,
      spent: 3738000,
      status: 'delayed',
      dueDate: '2024-03-15'
    },
    {
      id: 3,
      name: 'Hospital Wing Renovation',
      pm: 'Emily Davis',
      progress: 88,
      budget: 3200000,
      spent: 2816000,
      status: 'on-track',
      dueDate: '2024-01-31'
    }
  ];

  // Highcharts configurations
  const projectStatusChart = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      style: {
        fontFamily: 'inherit'
      }
    },
    title: {
      text: 'Project Status Overview',
      style: {
        fontSize: '16px',
        fontWeight: '600'
      }
    },
    xAxis: {
      categories: ['In Progress', 'Completed', 'Pending', 'Delayed'],
      labels: {
        style: {
          fontSize: '12px'
        }
      }
    },
    yAxis: {
      title: {
        text: 'Number of Projects',
        style: {
          fontSize: '12px'
        }
      }
    },
    series: [{
      name: 'Projects',
      data: [8, 12, 5, 2],
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

  const budgetDistributionChart = {
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
      data: [
        { name: 'Commercial', y: 45, color: '#ef4444' },
        { name: 'Residential', y: 30, color: '#f87171' },
        { name: 'Industrial', y: 15, color: '#fca5a5' },
        { name: 'Institutional', y: 10, color: '#fecaca' }
      ]
    }],
    credits: {
      enabled: false
    }
  };

  const performanceLineChart = {
    chart: {
      type: 'area',
      backgroundColor: 'transparent',
      style: {
        fontFamily: 'inherit'
      }
    },
    title: {
      text: 'Monthly Performance Trend',
      style: {
        fontSize: '16px',
        fontWeight: '600'
      }
    },
    xAxis: {
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
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
      data: [88, 90, 85, 92, 94, 91, 93, 95, 94, 96, 94, 94],
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

  const revenueGrowthChart = {
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
      data: [65, 72, 78, 85],
      color: '#fca5a5',
      marker: {
        symbol: 'circle'
      }
    }, {
      name: '2024',
      data: [75, 82, 87, 94],
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

  const handleApproval = (projectId: number, approved: boolean) => {
    const action = approved ? 'approved' : 'rejected';
    toast.success(`Project ${action} successfully`);
  };

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
        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={projectStatusChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={budgetDistributionChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={performanceLineChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={revenueGrowthChart} />
          </motion.div>
        </div>

        {/* Pending Approvals Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-2xl shadow-lg border border-blue-100 p-6 mb-8"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <AlertCircle className="w-6 h-6 text-blue-600" />
              </div>
              Pending Estimations for Approval
            </h2>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all →</button>
          </div>

          <div className="space-y-4">
            {pendingApprovals.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * index }}
                className="bg-gradient-to-r from-gray-50 to-blue-100/30 rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all hover:border-blue-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-bold text-gray-900 text-lg">{project.projectName}</h3>
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                        project.priority === 'high' ? 'bg-red-100 text-red-700' :
                        project.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {project.priority} priority
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-6">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Estimator</p>
                        <p className="font-semibold text-gray-900">{project.estimator}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Project Value</p>
                        <p className="font-semibold text-gray-900">₹{(project.value / 100000).toFixed(1)}L</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Profit Margin</p>
                        <p className="font-semibold text-green-600">{project.profitMargin}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Items</p>
                        <p className="font-semibold text-gray-900">{project.items} items</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-6">
                    <button
                      onClick={() => setSelectedProject(project)}
                      className="p-2.5 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group"
                    >
                      <Eye className="w-5 h-5 text-gray-600 group-hover:text-gray-900" />
                    </button>
                    <button
                      onClick={() => handleApproval(project.id, true)}
                      className="p-2.5 bg-green-50 hover:bg-green-100 rounded-lg transition-colors group"
                    >
                      <ThumbsUp className="w-5 h-5 text-green-600 group-hover:text-green-700" />
                    </button>
                    <button
                      onClick={() => handleApproval(project.id, false)}
                      className="p-2.5 bg-red-50 hover:bg-red-100 rounded-lg transition-colors group"
                    >
                      <ThumbsDown className="w-5 h-5 text-red-600 group-hover:text-red-700" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Active Projects Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
              <BarChart3 className="w-6 h-6 text-blue-600" />
            </div>
            Active Projects Overview
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {activeProjects.map((project, index) => (
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
                            ? 'bg-gradient-to-r from-green-50 to-green-100'
                            : 'bg-gradient-to-r from-red-50 to-red-100'
                        }`}
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <div>
                      <p className="text-xs text-gray-500">Budget Used</p>
                      <p className="font-medium text-gray-900">₹{(project.spent / 100000).toFixed(1)}L</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Due Date</p>
                      <p className="font-medium text-gray-900">{project.dueDate}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default TechnicalDirectorDashboard;