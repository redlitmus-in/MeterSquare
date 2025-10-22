import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
import { toast } from 'sonner';

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
      toast.error('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Materials',
      value: stats.total_materials,
      icon: CubeIcon,
      bgColor: 'bg-orange-50',
      iconBg: 'bg-orange-100',
      textColor: 'text-orange-600',
      borderColor: 'border-orange-200',
    },
    {
      title: 'Pending Purchase',
      value: stats.pending_purchase,
      icon: ClockIcon,
      bgColor: 'bg-yellow-50',
      iconBg: 'bg-yellow-100',
      textColor: 'text-yellow-600',
      borderColor: 'border-yellow-200',
    },
    {
      title: 'Ordered',
      value: stats.ordered,
      icon: ShoppingCartIcon,
      bgColor: 'bg-blue-50',
      iconBg: 'bg-blue-100',
      textColor: 'text-blue-600',
      borderColor: 'border-blue-200',
    },
    {
      title: 'Delivered',
      value: stats.delivered,
      icon: CheckCircleIcon,
      bgColor: 'bg-green-50',
      iconBg: 'bg-green-100',
      textColor: 'text-green-600',
      borderColor: 'border-green-200',
    },
    {
      title: 'Active Projects',
      value: stats.total_projects,
      icon: BuildingOfficeIcon,
      bgColor: 'bg-purple-50',
      iconBg: 'bg-purple-100',
      textColor: 'text-purple-600',
      borderColor: 'border-purple-200',
    },
    {
      title: 'Total Value',
      value: `AED ${stats.total_cost.toLocaleString()}`,
      icon: TruckIcon,
      bgColor: 'bg-indigo-50',
      iconBg: 'bg-indigo-100',
      textColor: 'text-indigo-600',
      borderColor: 'border-indigo-200',
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 sm:p-8 border border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2 text-gray-800">
                Buyer Dashboard
              </h1>
              <p className="text-gray-600 text-sm sm:text-base">
                Welcome back, {user?.full_name || 'Buyer'}
              </p>
            </div>
            <div className="hidden sm:block">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-orange-200">
                <ShoppingCartIcon className="w-12 h-12 text-orange-600" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
        {statCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`${card.bgColor} rounded-xl p-6 border ${card.borderColor} hover:shadow-md transition-shadow`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${card.iconBg}`}>
                <card.icon className={`w-6 h-6 ${card.textColor}`} />
              </div>
            </div>
            <h3 className="text-gray-600 text-sm font-medium mb-1">{card.title}</h3>
            <p className={`text-2xl font-bold ${card.textColor}`}>
              {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-200"
      >
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <ShoppingCartIcon className="w-6 h-6 text-purple-600" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-4">
          <a
            href="/buyer/purchase-orders"
            className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg hover:shadow-md transition-shadow border border-purple-200"
          >
            <ShoppingCartIcon className="w-8 h-8 text-purple-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-gray-800">Purchase Orders</p>
              <p className="text-xs text-gray-600">View and manage approved change requests for extra materials</p>
            </div>
          </a>
        </div>
      </motion.div>
    </div>
  );
};

export default BuyerDashboard;
