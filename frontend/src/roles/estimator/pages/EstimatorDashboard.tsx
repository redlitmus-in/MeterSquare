import React, { useState } from 'react';
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
  Send
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

const EstimatorDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [selectedBoq, setSelectedBoq] = useState<any>(null);

  // Pending BOQs for submission
  const pendingBoqs = [
    {
      id: 1,
      projectName: 'Corporate Office - 5th Floor',
      client: 'Tech Solutions Ltd',
      value: 3440000,
      items: 45,
      createdDate: '2024-01-15',
      priority: 'high',
      profitMargin: 28
    },
    {
      id: 2,
      projectName: 'Retail Store Renovation',
      client: 'Fashion Hub',
      value: 1250000,
      items: 23,
      createdDate: '2024-01-14',
      priority: 'medium',
      profitMargin: 22
    },
    {
      id: 3,
      projectName: 'Restaurant Interior',
      client: 'Gourmet Foods',
      value: 890000,
      items: 18,
      createdDate: '2024-01-13',
      priority: 'low',
      profitMargin: 25
    }
  ];

  // Active BOQs under review
  const activeBoqs = [
    {
      id: 1,
      name: 'Tech Park Building A',
      client: 'Tech Solutions',
      progress: 65,
      value: 5600000,
      spent: 3640000,
      status: 'approved',
      reviewDate: '2024-01-10'
    },
    {
      id: 2,
      name: 'Mall Extension Project',
      client: 'Mall Group',
      progress: 42,
      value: 8900000,
      spent: 3738000,
      status: 'rejected',
      reviewDate: '2024-01-08'
    },
    {
      id: 3,
      name: 'Hospital Wing Renovation',
      client: 'HealthCare Plus',
      progress: 88,
      value: 3200000,
      spent: 2816000,
      status: 'approved',
      reviewDate: '2024-01-05'
    }
  ];

  // Highcharts configurations - matching the provided design
  const projectsByStatusChart = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      style: {
        fontFamily: 'inherit'
      }
    },
    title: {
      text: 'Projects by Status',
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
      name: 'Projects',
      data: [
        { name: 'Planning', y: 1, color: '#818cf8' },
        { name: 'In Progress', y: 2, color: '#34d399' },
        { name: 'Delayed', y: 1, color: '#f87171' },
        { name: 'Completed', y: 1, color: '#6366f1' }
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
      text: 'Budget Utilization',
      align: 'left',
      style: {
        fontSize: '18px',
        fontWeight: '600',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: ['Tech', 'Mall', 'Hospital', 'Corporate', 'Luxury'],
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
        text: 'Amount (Lakhs)',
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
      name: 'Budget',
      data: [55, 85, 25, 120, 65],
      color: 'rgba(147, 197, 253, 0.5)'
    }, {
      name: 'Spent',
      data: [35, 35, 15, 60, 0],
      color: '#6366f1'
    }],
    legend: {
      align: 'center',
      verticalAlign: 'bottom',
      layout: 'horizontal',
      itemStyle: {
        fontSize: '12px',
        fontWeight: 'normal',
        color: '#6b7280'
      }
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
      text: 'Progress Timeline',
      align: 'left',
      style: {
        fontSize: '18px',
        fontWeight: '600',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
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
        text: 'Progress %',
        style: {
          fontSize: '12px',
          color: '#6b7280'
        }
      },
      max: 100,
      gridLineColor: '#e5e7eb',
      gridLineDashStyle: 'Dot'
    },
    plotOptions: {
      spline: {
        lineWidth: 3,
        marker: {
          enabled: false
        }
      }
    },
    series: [{
      name: 'Tech',
      data: [0, 10, 25, 45, 65, 70],
      color: '#60a5fa'
    }, {
      name: 'Mall',
      data: [0, 5, 15, 30, 42, 45],
      color: '#6366f1'
    }, {
      name: 'Hospital',
      data: [20, 40, 60, 75, 88, 92],
      color: '#34d399'
    }],
    legend: {
      align: 'center',
      verticalAlign: 'bottom',
      layout: 'horizontal',
      itemStyle: {
        fontSize: '12px',
        fontWeight: 'normal',
        color: '#6b7280'
      }
    },
    credits: {
      enabled: false
    }
  };

  const handleSubmitBOQ = (boqId: number) => {
    toast.success(`BOQ submitted for approval`);
  };

  const handleEditBOQ = (boqId: number) => {
    toast.info(`Opening BOQ editor for ID: ${boqId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Simple Header with Blue Gradient */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <h1 className="text-2xl font-bold text-blue-900">Estimator Dashboard</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Charts Section - 3 charts as per design */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-md p-6">
            <HighchartsReact highcharts={Highcharts} options={projectsByStatusChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-md p-6">
            <HighchartsReact highcharts={Highcharts} options={budgetUtilizationChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-xl shadow-md p-6">
            <HighchartsReact highcharts={Highcharts} options={progressTimelineChart} />
          </motion.div>
        </div>

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
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">View all →</button>
          </div>

          <div className="space-y-4">
            {pendingBoqs.map((boq, index) => (
              <motion.div
                key={boq.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * index }}
                className="bg-gradient-to-r from-gray-50 to-blue-50/30 rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all hover:border-blue-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="font-bold text-gray-900 text-lg">{boq.projectName}</h3>
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                        boq.priority === 'high' ? 'bg-red-100 text-red-700' :
                        boq.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {boq.priority} priority
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-6">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Client</p>
                        <p className="font-semibold text-gray-900">{boq.client}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Project Value</p>
                        <p className="font-semibold text-gray-900">₹{(boq.value / 100000).toFixed(1)}L</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Profit Margin</p>
                        <p className="font-semibold text-green-600">{boq.profitMargin}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Items</p>
                        <p className="font-semibold text-gray-900">{boq.items} items</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-6">
                    <button
                      onClick={() => setSelectedBoq(boq)}
                      className="p-2.5 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors group">
                      <Eye className="w-5 h-5 text-gray-600 group-hover:text-gray-900" />
                    </button>
                    <button
                      onClick={() => handleEditBOQ(boq.id)}
                      className="p-2.5 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors group">
                      <Edit className="w-5 h-5 text-blue-600 group-hover:text-blue-700" />
                    </button>
                    <button
                      onClick={() => handleSubmitBOQ(boq.id)}
                      className="p-2.5 bg-green-50 hover:bg-green-100 rounded-lg transition-colors group">
                      <Send className="w-5 h-5 text-green-600 group-hover:text-green-700" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {activeBoqs.map((boq, index) => (
              <motion.div
                key={boq.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
                className="bg-white rounded-2xl border border-blue-100 p-5 hover:shadow-lg transition-all">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-gray-900">{boq.name}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    boq.status === 'approved'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {boq.status === 'approved' ? 'Approved' : 'Rejected'}
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Client</p>
                    <p className="font-medium text-gray-900">{boq.client}</p>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">Completion</span>
                      <span className="font-medium text-gray-900">{boq.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          boq.status === 'approved'
                            ? 'bg-gradient-to-r from-green-400 to-green-600'
                            : 'bg-gradient-to-r from-red-400 to-red-600'
                        }`}
                        style={{ width: `${boq.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between pt-2 border-t border-gray-100">
                    <div>
                      <p className="text-xs text-gray-500">BOQ Value</p>
                      <p className="font-medium text-gray-900">₹{(boq.value / 100000).toFixed(1)}L</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Review Date</p>
                      <p className="font-medium text-gray-900">{boq.reviewDate}</p>
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

export default EstimatorDashboard;