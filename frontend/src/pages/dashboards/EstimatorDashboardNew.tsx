import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Calculator,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
  BarChart3,
  PieChart,
  Target,
  Activity,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Upload,
  Download,
  Send,
  Eye,
  Edit,
  Copy,
  Filter,
  Calendar,
  Bell,
  Layers,
  ClipboardList,
  Building2,
  Users,
  Briefcase,
  TrendingDown,
  FileCheck,
  FileX,
  FilePlus
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import BOQCreationForm from '@/components/forms/BOQCreationForm';

const EstimatorDashboardNew: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedBoq, setSelectedBoq] = useState<any>(null);
  const [showBOQForm, setShowBOQForm] = useState(false);

  const stats = {
    totalBoqs: 156,
    pendingBoqs: 8,
    approvedBoqs: 142,
    rejectedBoqs: 6,
    avgEstimationTime: '3.2 hours',
    totalEstimatedValue: 45670000,
    avgProfitMargin: 26,
    accuracyRate: 94
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (index: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: index * 0.1,
        duration: 0.5,
        ease: "easeOut"
      }
    }),
    hover: {
      y: -5,
      transition: { duration: 0.2 }
    }
  };

  // Recent BOQs
  const recentBoqs = [
    {
      id: 1,
      projectName: 'Corporate Office - 5th Floor',
      client: 'Tech Solutions Ltd',
      items: 45,
      totalValue: 3440000,
      status: 'pending',
      createdDate: '2024-01-15',
      profitMargin: 28,
      materials: 125,
      laborHours: 320
    },
    {
      id: 2,
      projectName: 'Retail Store Renovation',
      client: 'Fashion Hub',
      items: 23,
      totalValue: 1250000,
      status: 'approved',
      createdDate: '2024-01-14',
      profitMargin: 22,
      materials: 67,
      laborHours: 180
    },
    {
      id: 3,
      projectName: 'Restaurant Interior',
      client: 'Gourmet Foods',
      items: 18,
      totalValue: 890000,
      status: 'draft',
      createdDate: '2024-01-13',
      profitMargin: 25,
      materials: 45,
      laborHours: 120
    },
    {
      id: 4,
      projectName: 'Medical Clinic Setup',
      client: 'HealthCare Plus',
      items: 32,
      totalValue: 2100000,
      status: 'approved',
      createdDate: '2024-01-12',
      profitMargin: 30,
      materials: 89,
      laborHours: 240
    }
  ];

  // Material price trends
  const materialTrends = [
    { material: 'Glass Panels', trend: 'up', change: 8, currentPrice: 450 },
    { material: 'Aluminum Frames', trend: 'down', change: -3, currentPrice: 320 },
    { material: 'Wood Panels', trend: 'up', change: 12, currentPrice: 680 },
    { material: 'Steel Sections', trend: 'stable', change: 1, currentPrice: 280 }
  ];

  // BOQ Templates
  const templates = [
    { id: 1, name: 'Office Interior Standard', items: 35, usageCount: 24 },
    { id: 2, name: 'Retail Store Basic', items: 28, usageCount: 18 },
    { id: 3, name: 'Restaurant Complete', items: 42, usageCount: 15 },
    { id: 4, name: 'Medical Facility', items: 48, usageCount: 12 }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-8 h-8 text-indigo-600" />
                Estimator Dashboard
              </h1>
              <p className="text-sm text-gray-500 mt-1">Create and manage Bill of Quantities</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                <Plus className="w-4 h-4" />
                New BOQ
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative">
                <Bell className="w-5 h-5 text-gray-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user?.name || 'Estimator'}</p>
                  <p className="text-xs text-gray-500">BOQ Specialist</p>
                </div>
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                  <FileText className="w-5 h-5 text-indigo-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-6 mt-6">
            {['overview', 'boqs', 'materials', 'templates', 'analytics'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 px-1 border-b-2 transition-colors capitalize ${
                  activeTab === tab
                    ? 'border-indigo-600 text-indigo-600 font-medium'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'boqs' ? 'BOQs' : tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'overview' && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <motion.div
                custom={0}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                className="card bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <FileText className="w-6 h-6 text-indigo-600" />
                  </div>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" /> +15%
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{stats.totalBoqs}</h3>
                <p className="text-sm text-gray-500 mt-1">Total BOQs</p>
                <p className="text-xs text-gray-400 mt-2">{stats.pendingBoqs} pending review</p>
              </motion.div>

              <motion.div
                custom={1}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                className="card bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <span className="text-xs font-medium text-gray-500">91%</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">{stats.approvedBoqs}</h3>
                <p className="text-sm text-gray-500 mt-1">Approved BOQs</p>
                <p className="text-xs text-gray-400 mt-2">This month: 12</p>
              </motion.div>

              <motion.div
                custom={2}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                className="card bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <DollarSign className="w-6 h-6 text-yellow-600" />
                  </div>
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">₹{(stats.totalEstimatedValue / 100000).toFixed(1)}L</h3>
                <p className="text-sm text-gray-500 mt-1">Total Estimated</p>
                <p className="text-xs text-gray-400 mt-2">Avg margin: {stats.avgProfitMargin}%</p>
              </motion.div>

              <motion.div
                custom={3}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                whileHover="hover"
                className="card bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Target className="w-6 h-6 text-purple-600" />
                  </div>
                  <span className="text-xs font-medium text-purple-600">{stats.accuracyRate}%</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900">High</h3>
                <p className="text-sm text-gray-500 mt-1">Accuracy Rate</p>
                <p className="text-xs text-gray-400 mt-2">Avg time: {stats.avgEstimationTime}</p>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent BOQs */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">Recent BOQs</h2>
                  <button className="text-sm text-indigo-600 hover:text-indigo-700">View all</button>
                </div>
                <div className="space-y-4">
                  {recentBoqs.map((boq) => (
                    <div key={boq.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-gray-900">{boq.projectName}</h3>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              boq.status === 'approved' ? 'bg-green-50 text-green-600' :
                              boq.status === 'pending' ? 'bg-yellow-50 text-yellow-600' :
                              boq.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                              'bg-red-50 text-red-600'
                            }`}>
                              {boq.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mb-3">{boq.client}</p>
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Items:</span>
                              <p className="font-medium text-gray-900">{boq.items}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Value:</span>
                              <p className="font-medium text-gray-900">₹{(boq.totalValue / 100000).toFixed(1)}L</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Materials:</span>
                              <p className="font-medium text-gray-900">{boq.materials}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Margin:</span>
                              <p className="font-medium text-green-600">{boq.profitMargin}%</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Material Price Trends */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                <h2 className="text-lg font-semibold text-gray-900 mb-6">Material Price Trends</h2>
                <div className="space-y-4">
                  {materialTrends.map((item) => (
                    <div key={item.material} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{item.material}</p>
                        <p className="text-xs text-gray-500">₹{item.currentPrice}/unit</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.trend === 'up' ? (
                          <ArrowUpRight className="w-4 h-4 text-red-500" />
                        ) : item.trend === 'down' ? (
                          <ArrowDownRight className="w-4 h-4 text-green-500" />
                        ) : (
                          <Activity className="w-4 h-4 text-gray-400" />
                        )}
                        <span className={`text-sm font-medium ${
                          item.trend === 'up' ? 'text-red-500' :
                          item.trend === 'down' ? 'text-green-500' :
                          'text-gray-500'
                        }`}>
                          {item.trend === 'stable' ? '0%' : `${Math.abs(item.change)}%`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="w-full mt-4 text-sm text-indigo-600 hover:text-indigo-700 py-2 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                  View Full Report
                </button>
              </motion.div>
            </div>

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-6 bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-xl p-6 text-white"
            >
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button className="flex flex-col items-center gap-2 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
                  <FilePlus className="w-6 h-6" />
                  <span className="text-sm">New BOQ</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
                  <Upload className="w-6 h-6" />
                  <span className="text-sm">Import BOQ</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
                  <Calculator className="w-6 h-6" />
                  <span className="text-sm">Cost Calculator</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
                  <Send className="w-6 h-6" />
                  <span className="text-sm">Submit for Approval</span>
                </button>
              </div>
            </motion.div>
          </>
        )}

        {activeTab === 'boqs' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">All BOQs</h2>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Filter className="w-4 h-4" />
                  Filter
                </button>
                <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Download className="w-4 h-4" />
                  Export
                </button>
                <button
                  onClick={() => setShowBOQForm(true)}
                  className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  <Plus className="w-4 h-4" />
                  Create BOQ
                </button>
              </div>
            </div>
            {/* Full BOQ list would go here */}
          </motion.div>
        )}

        {activeTab === 'templates' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {templates.map((template) => (
              <div key={template.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <Layers className="w-6 h-6 text-indigo-600" />
                  </div>
                  <span className="text-xs text-gray-500">Used {template.usageCount} times</span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{template.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{template.items} pre-configured items</p>
                <button className="w-full py-2 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
                  Use Template
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </div>

      {/* BOQ Creation Form Modal */}
      <BOQCreationForm
        isOpen={showBOQForm}
        onClose={() => setShowBOQForm(false)}
        onSubmit={(data) => {
          console.log('BOQ Data:', data);
          // Handle BOQ submission here
          toast.success('BOQ created successfully');
        }}
      />
    </div>
  );
};

export default EstimatorDashboardNew;