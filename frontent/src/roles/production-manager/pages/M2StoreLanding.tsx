import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  Truck,
  Send,
  BarChart3,
  ArrowRight,
  Box,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Layers
} from 'lucide-react';
import { inventoryService } from '../services/inventoryService';

interface QuickStats {
  totalItems: number;
  totalValue: number;
  lowStockCount: number;
  pendingRequests: number;
}

const M2StoreLanding: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<QuickStats>({
    totalItems: 0,
    totalValue: 0,
    lowStockCount: 0,
    pendingRequests: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuickStats();
  }, []);

  const fetchQuickStats = async () => {
    try {
      const data = await inventoryService.getDashboardData();
      setStats({
        totalItems: data.totalItems || 0,
        totalValue: data.totalValue || 0,
        lowStockCount: (data.lowStockItems || 0) + (data.criticalItems || 0) + (data.outOfStockItems || 0),
        pendingRequests: data.pendingRequests || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const modules = [
    {
      id: 'inventory',
      title: 'Inventory Management',
      description: 'Manage materials, stock levels, receive and dispatch materials',
      icon: Package,
      href: '/production-manager/m2-store/stock',
      gradient: 'from-blue-500 to-blue-600',
      lightBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      stats: `${stats.totalItems} Items`
    },
    {
      id: 'receive',
      title: 'Receive Stock',
      description: 'Record incoming materials and create goods received notes',
      icon: Truck,
      href: '/production-manager/m2-store/stock',
      gradient: 'from-emerald-500 to-emerald-600',
      lightBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      stats: 'GRN Entry'
    },
    {
      id: 'dispatch',
      title: 'Dispatch Materials',
      description: 'Process and track material dispatch to project sites',
      icon: Send,
      href: '/production-manager/m2-store/stock',
      gradient: 'from-violet-500 to-violet-600',
      lightBg: 'bg-violet-50',
      iconColor: 'text-violet-600',
      stats: `${stats.pendingRequests} Pending`
    },
    {
      id: 'reports',
      title: 'Reports & Analytics',
      description: 'View detailed inventory reports and movement analysis',
      icon: BarChart3,
      href: '/production-manager/m2-store/reports',
      gradient: 'from-slate-500 to-slate-600',
      lightBg: 'bg-slate-50',
      iconColor: 'text-slate-600',
      stats: 'Insights'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-gradient-to-br from-slate-600 to-slate-700 rounded-2xl flex items-center justify-center shadow-lg">
                <Box className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">M2 Store</h1>
                <p className="text-gray-500 mt-1">Central Inventory Management System</p>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-500">
              <Clock className="w-4 h-4" />
              <span>{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {loading ? (
            <>
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="h-3 bg-gray-200 rounded w-20 mb-2"></div>
                      <div className="h-7 bg-gray-200 rounded w-16 mt-1"></div>
                    </div>
                    <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Items</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {stats.totalItems.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Layers className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Stock Value</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      ₹{stats.totalValue >= 100000 ? `${(stats.totalValue / 100000).toFixed(1)}L` : stats.totalValue.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Low Stock</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {stats.lowStockCount}
                    </p>
                  </div>
                  <div className={`w-10 h-10 ${stats.lowStockCount > 0 ? 'bg-orange-100' : 'bg-green-100'} rounded-lg flex items-center justify-center`}>
                    {stats.lowStockCount > 0 ? (
                      <AlertTriangle className="w-5 h-5 text-orange-600" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {stats.pendingRequests}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                    <Send className="w-5 h-5 text-violet-600" />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Module Cards */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Inventory Modules</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {modules.map((module) => {
              const IconComponent = module.icon;
              return (
                <button
                  key={module.id}
                  onClick={() => navigate(module.href)}
                  className="bg-white rounded-2xl p-6 text-left transition-all duration-300 border border-gray-100 hover:border-gray-200 hover:shadow-lg group relative overflow-hidden"
                >
                  {/* Gradient accent */}
                  <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${module.gradient}`} />

                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-12 h-12 ${module.lightBg} rounded-xl flex items-center justify-center transition-transform group-hover:scale-110`}>
                      <IconComponent className={`w-6 h-6 ${module.iconColor}`} />
                    </div>
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-sm text-gray-400">Open</span>
                      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{module.title}</h3>
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2">{module.description}</p>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <span className={`text-xs font-medium ${module.iconColor} ${module.lightBg} px-2 py-1 rounded-md`}>
                      {module.stats}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Action */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-2xl p-6 text-white">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="mb-4 md:mb-0">
              <h3 className="text-xl font-semibold mb-1">Need to manage inventory?</h3>
              <p className="text-slate-300 text-sm">Go to Inventory Management to add, edit, receive or dispatch materials</p>
            </div>
            <button
              onClick={() => navigate('/production-manager/m2-store/stock')}
              className="bg-white text-slate-800 px-6 py-3 rounded-xl font-medium hover:bg-slate-100 transition-colors flex items-center space-x-2"
            >
              <Package className="w-5 h-5" />
              <span>Inventory Management</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default M2StoreLanding;
