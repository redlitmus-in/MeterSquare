import React, { useEffect } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { motion } from 'framer-motion';

const ProjectManagerDashboard: React.FC = () => {
  useEffect(() => {
    // Set Highcharts global options for consistent theming
    Highcharts.setOptions({
      colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'],
      chart: {
        style: {
          fontFamily: 'Inter, system-ui, sans-serif'
        }
      }
    });
  }, []);

  // Project Status Chart
  const projectStatusOptions = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Project Status Overview',
      style: {
        fontSize: '16px',
        fontWeight: 'bold'
      }
    },
    xAxis: {
      categories: ['Corporate Office', 'Retail Store', 'Restaurant', 'Medical Clinic'],
      labels: {
        style: {
          fontSize: '12px'
        }
      }
    },
    yAxis: {
      title: {
        text: 'Progress (%)'
      }
    },
    legend: {
      enabled: false
    },
    plotOptions: {
      column: {
        borderRadius: 8,
        dataLabels: {
          enabled: true,
          format: '{y}%',
          style: {
            fontSize: '11px'
          }
        }
      }
    },
    series: [{
      name: 'Progress',
      data: [
        { y: 65, color: '#3B82F6' },
        { y: 42, color: '#F59E0B' },
        { y: 88, color: '#10B981' },
        { y: 25, color: '#3B82F6' }
      ]
    }]
  };

  // Budget Utilization Chart
  const budgetUtilizationOptions = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Budget Utilization',
      style: {
        fontSize: '16px',
        fontWeight: 'bold'
      }
    },
    plotOptions: {
      pie: {
        innerSize: '60%',
        borderRadius: 8,
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
        { name: 'Utilized', y: 62.8, color: '#3B82F6' },
        { name: 'Remaining', y: 37.2, color: '#E5E7EB' }
      ]
    }]
  };

  // Procurement Status Chart
  const procurementStatusOptions = {
    chart: {
      type: 'area',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Weekly Procurement Trend',
      style: {
        fontSize: '16px',
        fontWeight: 'bold'
      }
    },
    xAxis: {
      categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    },
    yAxis: {
      title: {
        text: 'Items'
      }
    },
    legend: {
      align: 'center',
      verticalAlign: 'bottom'
    },
    plotOptions: {
      area: {
        fillOpacity: 0.3,
        marker: {
          radius: 3
        }
      }
    },
    series: [{
      name: 'Approved',
      data: [12, 15, 18, 14, 20, 16, 22],
      color: '#10B981'
    }, {
      name: 'Pending',
      data: [8, 10, 6, 12, 8, 5, 4],
      color: '#F59E0B'
    }]
  };

  // Team Performance Chart
  const teamPerformanceOptions = {
    chart: {
      type: 'bar',
      backgroundColor: 'transparent'
    },
    title: {
      text: 'Site Engineer Performance',
      style: {
        fontSize: '16px',
        fontWeight: 'bold'
      }
    },
    xAxis: {
      categories: ['John Smith', 'Sarah Wilson', 'Mike Johnson', 'Emily Davis']
    },
    yAxis: {
      title: {
        text: 'Efficiency (%)'
      },
      max: 100
    },
    legend: {
      enabled: false
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        dataLabels: {
          enabled: true,
          format: '{y}%',
          style: {
            fontSize: '11px'
          }
        }
      }
    },
    series: [{
      name: 'Efficiency',
      data: [
        { y: 94, color: '#10B981' },
        { y: 87, color: '#3B82F6' },
        { y: 91, color: '#10B981' },
        { y: 89, color: '#3B82F6' }
      ]
    }]
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header with Blue Gradient */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <h1 className="text-2xl font-bold text-blue-900">Project Manager Dashboard</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={projectStatusOptions} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={budgetUtilizationOptions} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={procurementStatusOptions} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-lg p-6"
          >
            <HighchartsReact highcharts={Highcharts} options={teamPerformanceOptions} />
          </motion.div>
        </div>

        {/* Recent Activities */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Activities</h2>
          <div className="space-y-3">
            {[
              { action: 'Material procurement approved', project: 'Corporate Office', time: '2 hours ago', status: 'success' },
              { action: 'Site Engineer assigned', project: 'Medical Clinic', time: '4 hours ago', status: 'info' },
              { action: 'Budget overrun alert', project: 'Retail Store', time: '6 hours ago', status: 'warning' },
              { action: 'Project milestone completed', project: 'Restaurant Interior', time: '1 day ago', status: 'success' }
            ].map((activity, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    activity.status === 'success' ? 'bg-green-500' :
                    activity.status === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                    <p className="text-xs text-gray-500">{activity.project}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-400">{activity.time}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ProjectManagerDashboard;