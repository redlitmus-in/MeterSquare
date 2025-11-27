import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  ShoppingCartIcon,
  CubeIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  ClockIcon,
  TruckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/store/authStore';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface DashboardStats {
  total_materials: number;
  pending_purchase: number;
  ordered: number;
  delivered: number;
  total_projects: number;
  total_cost: number;
}

const BuyerDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats>({
    total_materials: 0,
    pending_purchase: 0,
    ordered: 0,
    delivered: 0,
    total_projects: 0,
    total_cost: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      setLoading(true);
      const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const token = localStorage.getItem('access_token');

      if (!token) {
        throw new Error('No authentication token found');
      }

      // Fetch buyer dashboard stats
      const response = await fetch(`${API_URL}/buyer/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch purchase data');
      }

      const data = await response.json();

      if (data.success) {
        // Calculate stats from pending purchases
        const purchases = data.pending_purchases || [];
        const projectIds = new Set(purchases.map((p: any) => p.project_id));

        // Count total materials across all purchase orders
        const totalMaterials = purchases.reduce((sum: number, p: any) =>
          sum + (p.materials_count || 0), 0
        );

        setStats({
          total_materials: totalMaterials,
          pending_purchase: purchases.length, // All are pending by default
          ordered: 0, // Will need backend support for tracking order status
          delivered: 0, // Will need backend support for tracking delivery status
          total_projects: projectIds.size,
          total_cost: data.total_cost || 0,
        });
      }
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
      showError('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Materials',
      value: stats.total_materials,
      icon: CubeIcon,
      textColor: 'text-purple-500',
    },
    {
      title: 'Pending Purchase',
      value: stats.pending_purchase,
      icon: ClockIcon,
      textColor: 'text-yellow-500',
    },
    {
      title: 'Ordered',
      value: stats.ordered,
      icon: ShoppingCartIcon,
      textColor: 'text-blue-500',
    },
    {
      title: 'Delivered',
      value: stats.delivered,
      icon: CheckCircleIcon,
      textColor: 'text-green-500',
    },
    {
      title: 'Active Projects',
      value: stats.total_projects,
      icon: BuildingOfficeIcon,
      textColor: 'text-indigo-500',
    },
    {
      title: 'Total Value',
      value: `AED ${stats.total_cost.toLocaleString()}`,
      icon: TruckIcon,
      textColor: 'text-orange-500',
    },
  ];

  // Chart configurations
  const purchaseStatusChart = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Purchase Status',
      align: 'center',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    series: [{
      name: 'Items',
      data: [
        { name: 'Pending', y: stats.pending_purchase || 0, color: '#f59e0b' },
        { name: 'Ordered', y: stats.ordered || 0, color: '#3b82f6' },
        { name: 'Delivered', y: stats.delivered || 0, color: '#10b981' }
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

  const materialsTrendChart = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Materials Overview',
      align: 'center',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: ['Total Materials', 'Pending', 'Ordered', 'Delivered'],
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        }
      }
    },
    yAxis: {
      title: {
        text: 'Count',
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
      name: 'Materials',
      data: [
        stats.total_materials,
        stats.pending_purchase,
        stats.ordered,
        stats.delivered
      ],
      color: '#243d8a'
    }],
    plotOptions: {
      column: {
        borderRadius: 5,
        dataLabels: { enabled: false }
      }
    },
    legend: {
      enabled: false
    },
    credits: { enabled: false }
  };

  const projectCostChart = {
    chart: {
      type: 'bar',
      backgroundColor: 'transparent',
      height: 300
    },
    title: {
      text: 'Project Statistics',
      align: 'center',
      style: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#1f2937'
      }
    },
    xAxis: {
      categories: ['Projects', 'Total Value (K)'],
      labels: {
        style: {
          fontSize: '11px',
          color: '#6b7280'
        }
      }
    },
    yAxis: {
      title: {
        text: '',
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
      name: 'Value',
      data: [stats.total_projects, Math.round(stats.total_cost / 1000)],
      color: '#10b981'
    }],
    plotOptions: {
      bar: {
        borderRadius: 5,
        dataLabels: { enabled: true }
      }
    },
    legend: {
      enabled: false
    },
    credits: { enabled: false }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" color="blue" size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header - Matching Estimator Style */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
              <ShoppingCartIcon className="w-6 h-6 text-[#243d8a]" />
            </div>
            <h1 className="text-2xl font-bold text-[#243d8a]">Buyer Dashboard</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

      {/* Summary Stats - Matching Estimator Style */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {statCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.title}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                </p>
              </div>
              <card.icon className={`w-8 h-8 ${card.textColor}`} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts - Matching Estimator Style */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
        >
          <HighchartsReact highcharts={Highcharts} options={purchaseStatusChart} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
        >
          <HighchartsReact highcharts={Highcharts} options={materialsTrendChart} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white rounded-xl shadow-md border border-gray-100 p-4"
        >
          <HighchartsReact highcharts={Highcharts} options={projectCostChart} />
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <ShoppingCartIcon className="w-6 h-6 text-[#243d8a]" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-4">
          <a
            href="/buyer/purchase-orders"
            className="flex items-center gap-3 p-4 bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 rounded-lg hover:shadow-md transition-shadow border border-[#243d8a]/20"
          >
            <ShoppingCartIcon className="w-8 h-8 text-[#243d8a] flex-shrink-0" />
            <div>
              <p className="font-bold text-gray-800">Purchase Orders</p>
              <p className="text-xs text-gray-600">View and manage approved change requests for extra materials</p>
            </div>
          </a>
        </div>
      </motion.div>
      </div>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(BuyerDashboard);
