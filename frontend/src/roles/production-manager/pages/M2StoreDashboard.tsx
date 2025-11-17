import React from 'react';
import { Link } from 'react-router-dom';
import { Package, TrendingUp, AlertTriangle, DollarSign, ArrowRight } from 'lucide-react';

// Mock dashboard stats
const mockStats = {
  totalItems: 1234,
  totalValue: 4520000, // ₹45.2L
  lowStockItems: 23,
  criticalItems: 3,
  pendingDispatches: 5,
  recentActivity: 12
};

const M2StoreDashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Production Manager Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome to M2 Store Management System
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Items */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Stock Items</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {mockStats.totalItems.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Package className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </div>

          {/* Total Value */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Inventory Value</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  ₹{(mockStats.totalValue / 100000).toFixed(1)}L
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <DollarSign className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </div>

          {/* Low Stock */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Low Stock Items</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {mockStats.lowStockItems}
                </p>
                <p className="mt-1 text-xs text-red-600 font-semibold">
                  {mockStats.criticalItems} Critical
                </p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>
          </div>

          {/* Pending Dispatches */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Dispatches</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {mockStats.pendingDispatches}
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <TrendingUp className="w-8 h-8 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Materials */}
          <Link to="/production-manager/m2-store/materials">
            <div className="bg-white rounded-lg shadow-sm border-2 border-gray-200 p-6 hover:border-teal-500 hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-teal-100 rounded-lg group-hover:bg-teal-500 transition-colors">
                  <Package className="w-6 h-6 text-teal-600 group-hover:text-white transition-colors" />
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-teal-600 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Materials Master</h3>
              <p className="mt-1 text-sm text-gray-500">
                Manage material catalog and monitor stock levels
              </p>
            </div>
          </Link>

          {/* Receive Stock */}
          <Link to="/production-manager/m2-store/receive">
            <div className="bg-white rounded-lg shadow-sm border-2 border-gray-200 p-6 hover:border-green-500 hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-500 transition-colors">
                  <Package className="w-6 h-6 text-green-600 group-hover:text-white transition-colors" />
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-green-600 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Receive Stock</h3>
              <p className="mt-1 text-sm text-gray-500">
                GRN - Goods receipt note
              </p>
            </div>
          </Link>

          {/* Dispatch */}
          <Link to="/production-manager/m2-store/dispatch">
            <div className="bg-white rounded-lg shadow-sm border-2 border-gray-200 p-6 hover:border-purple-500 hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-500 transition-colors">
                  <Package className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-purple-600 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Dispatch Materials</h3>
              <p className="mt-1 text-sm text-gray-500">
                Issue materials to buyers/projects
              </p>
            </div>
          </Link>

          {/* Stock Take */}
          <Link to="/production-manager/m2-store/stock-take">
            <div className="bg-white rounded-lg shadow-sm border-2 border-gray-200 p-6 hover:border-orange-500 hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-orange-100 rounded-lg group-hover:bg-orange-500 transition-colors">
                  <Package className="w-6 h-6 text-orange-600 group-hover:text-white transition-colors" />
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-orange-600 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Stock Take</h3>
              <p className="mt-1 text-sm text-gray-500">
                Physical vs system stock reconciliation
              </p>
            </div>
          </Link>

          {/* Reports */}
          <Link to="/production-manager/m2-store/reports">
            <div className="bg-white rounded-lg shadow-sm border-2 border-gray-200 p-6 hover:border-indigo-500 hover:shadow-lg transition-all duration-200 cursor-pointer group">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-indigo-100 rounded-lg group-hover:bg-indigo-500 transition-colors">
                  <Package className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Reports & Analytics</h3>
              <p className="mt-1 text-sm text-gray-500">
                Inventory reports and insights
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default React.memo(M2StoreDashboard);
