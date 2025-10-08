import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  BuildingOfficeIcon,
  ClockIcon,
  CheckCircleIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/store/authStore';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { siteEngineerService } from '../services/siteEngineerService';

interface DashboardStats {
  total_projects: number;
  assigned_projects: number;
  ongoing_projects: number;
  completed_projects: number;
}

const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats>({
    total_projects: 0,
    assigned_projects: 0,
    ongoing_projects: 0,
    completed_projects: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await siteEngineerService.getDashboardStats();
      setStats(response.stats || response);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Projects',
      value: stats.total_projects,
      icon: BuildingOfficeIcon,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-900'
    },
    {
      title: 'Assigned Projects',
      value: stats.assigned_projects,
      icon: ClockIcon,
      color: 'from-orange-500 to-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      textColor: 'text-orange-900'
    },
    {
      title: 'Ongoing Projects',
      value: stats.ongoing_projects,
      icon: ChartBarIcon,
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-900'
    },
    {
      title: 'Completed Projects',
      value: stats.completed_projects,
      icon: CheckCircleIcon,
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      textColor: 'text-green-900'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Welcome back, {user?.full_name?.split(' ')[0] || 'Site Engineer'}!</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-2">Here's an overview of your projects</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`${stat.bgColor} ${stat.borderColor} border-2 rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-200`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-1">{stat.title}</p>
                  <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.color} shadow-lg`}>
                  <stat.icon className="w-8 h-8 text-white" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <a
              href="/siteSupervisor/projects/assigned"
              className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 hover:shadow-md transition-all"
            >
              <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
              <div>
                <p className="font-semibold text-blue-900">View Assigned Projects</p>
                <p className="text-xs text-blue-700">Manage your assigned work</p>
              </div>
            </a>
            <a
              href="/siteSupervisor/projects/ongoing"
              className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 hover:shadow-md transition-all"
            >
              <ChartBarIcon className="w-6 h-6 text-purple-600" />
              <div>
                <p className="font-semibold text-purple-900">Track Progress</p>
                <p className="text-xs text-purple-700">Monitor ongoing projects</p>
              </div>
            </a>
            <a
              href="/siteSupervisor/projects/completed"
              className="flex items-center gap-3 p-4 rounded-lg bg-gradient-to-br from-green-50 to-green-100 border border-green-200 hover:shadow-md transition-all"
            >
              <CheckCircleIcon className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-semibold text-green-900">View Completed</p>
                <p className="text-xs text-green-700">Review finished projects</p>
              </div>
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
