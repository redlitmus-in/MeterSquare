import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import {
  ShoppingCartIcon,
  CubeIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  ClockIcon,
  TruckIcon,
  ArrowRightIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/store/authStore';
import { showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { API_BASE_URL } from '@/api/config';

interface DashboardStats {
  total_materials: number;
  pending_purchase: number;
  ordered: number;
  delivered: number;
  total_projects: number;
  total_cost: number;
}

interface WorkflowStats {
  new_requests: number;
  pending_td_approval: number;
  vendor_approved: number;
  purchase_completed: number;
  total_orders: number;
}

interface CostBreakdown {
  pending_cost: number;
  ordered_cost: number;
  completed_cost: number;
  total_cost: number;
}

interface MaterialsBreakdown {
  pending_materials: number;
  ordered_materials: number;
  completed_materials: number;
}

interface ProjectData {
  project_id: number;
  project_name: string;
  total_orders: number;
  pending: number;
  completed: number;
  total_cost: number;
}

interface RecentPurchase {
  cr_id: number;
  po_child_id?: number;
  formatted_id?: string;
  project_id: number;
  project_name: string;
  materials_count: number;
  total_cost: number;
  status: string;
  status_display: string;
  created_at: string;
  updated_at: string;
  vendor_name: string | null;
}

const BuyerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats>({
    total_materials: 0,
    pending_purchase: 0,
    ordered: 0,
    delivered: 0,
    total_projects: 0,
    total_cost: 0,
  });
  const [workflowStats, setWorkflowStats] = useState<WorkflowStats>({
    new_requests: 0,
    pending_td_approval: 0,
    vendor_approved: 0,
    purchase_completed: 0,
    total_orders: 0,
  });
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown>({
    pending_cost: 0,
    ordered_cost: 0,
    completed_cost: 0,
    total_cost: 0,
  });
  const [materialsBreakdown, setMaterialsBreakdown] = useState<MaterialsBreakdown>({
    pending_materials: 0,
    ordered_materials: 0,
    completed_materials: 0,
  });
  const [completionRate, setCompletionRate] = useState(0);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<RecentPurchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');

      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_BASE_URL}/buyer/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const data = await response.json();

      if (data.success) {
        // Set all stats from API
        if (data.stats) {
          setStats({
            total_materials: data.stats.total_materials || 0,
            pending_purchase: data.stats.pending_purchase || 0,
            ordered: data.stats.ordered || 0,
            delivered: data.stats.delivered || 0,
            total_projects: data.stats.total_projects || 0,
            total_cost: data.stats.total_cost || 0,
          });
        }

        if (data.workflow_stats) {
          setWorkflowStats(data.workflow_stats);
        }

        if (data.cost_breakdown) {
          setCostBreakdown(data.cost_breakdown);
        }

        if (data.materials_breakdown) {
          setMaterialsBreakdown(data.materials_breakdown);
        }

        if (data.completion_rate !== undefined) {
          setCompletionRate(data.completion_rate);
        }

        if (data.projects) {
          setProjects(data.projects);
        }

        if (data.recent_purchases) {
          setRecentPurchases(data.recent_purchases);
        }
      }
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
      showError('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const statusColors: Record<string, string> = {
      'assigned_to_buyer': 'bg-yellow-100 text-yellow-800',
      'send_to_buyer': 'bg-yellow-100 text-yellow-800',
      'approved_by_pm': 'bg-orange-100 text-orange-800',
      'under_review': 'bg-gray-100 text-gray-800',
      'pending_td_approval': 'bg-blue-100 text-blue-800',
      'vendor_approved': 'bg-indigo-100 text-indigo-800',
      'purchase_completed': 'bg-green-100 text-green-800',
    };
    return statusColors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Workflow Pipeline Steps
  const workflowSteps = [
    {
      title: 'New Requests',
      count: workflowStats.new_requests,
      description: 'Awaiting vendor selection',
      color: 'bg-yellow-500',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      icon: DocumentTextIcon,
    },
    {
      title: 'Pending TD Approval',
      count: workflowStats.pending_td_approval,
      description: 'Vendor selected, awaiting approval',
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      icon: ClockIcon,
    },
    {
      title: 'Ready to Purchase',
      count: workflowStats.vendor_approved,
      description: 'TD approved, ready for PO',
      color: 'bg-indigo-500',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      icon: ShoppingCartIcon,
    },
    {
      title: 'Completed',
      count: workflowStats.purchase_completed,
      description: 'Purchase completed',
      color: 'bg-green-500',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      icon: CheckCircleIcon,
    },
  ];

  // Chart: Cost Breakdown Pie
  const costBreakdownChart: Highcharts.Options = {
    chart: {
      type: 'pie',
      backgroundColor: 'transparent',
      height: 280
    },
    title: {
      text: 'Cost Distribution by Status',
      align: 'center',
      style: { fontSize: '14px', fontWeight: 'bold', color: '#1f2937' }
    },
    tooltip: {
      pointFormat: '<b>AED {point.y:,.0f}</b> ({point.percentage:.1f}%)',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderRadius: 8,
    },
    series: [{
      type: 'pie',
      name: 'Cost',
      data: [
        { name: 'Pending', y: costBreakdown.pending_cost, color: '#f59e0b' },
        { name: 'In Progress', y: costBreakdown.ordered_cost, color: '#3b82f6' },
        { name: 'Completed', y: costBreakdown.completed_cost, color: '#10b981' }
      ]
    }],
    plotOptions: {
      pie: {
        innerSize: '50%',
        dataLabels: {
          enabled: true,
          format: '<b>{point.name}</b><br/>AED {point.y:,.0f}',
          style: { fontSize: '11px', textOutline: 'none' }
        }
      }
    },
    legend: { enabled: false },
    credits: { enabled: false }
  };

  // Chart: Materials by Status
  const materialsChart: Highcharts.Options = {
    chart: {
      type: 'column',
      backgroundColor: 'transparent',
      height: 280
    },
    title: {
      text: 'Materials by Status',
      align: 'center',
      style: { fontSize: '14px', fontWeight: 'bold', color: '#1f2937' }
    },
    xAxis: {
      categories: ['Pending', 'In Progress', 'Completed'],
      labels: { style: { fontSize: '11px', color: '#6b7280' } }
    },
    yAxis: {
      title: { text: 'Count', style: { fontSize: '11px' } },
      labels: { style: { fontSize: '11px' } }
    },
    tooltip: {
      pointFormat: '<b>{point.y}</b> materials'
    },
    series: [{
      type: 'column',
      name: 'Materials',
      data: [
        { y: materialsBreakdown.pending_materials, color: '#f59e0b' },
        { y: materialsBreakdown.ordered_materials, color: '#3b82f6' },
        { y: materialsBreakdown.completed_materials, color: '#10b981' }
      ]
    }],
    plotOptions: {
      column: {
        borderRadius: 6,
        dataLabels: { enabled: true, format: '{point.y}', style: { fontSize: '12px', fontWeight: '600' } }
      }
    },
    legend: { enabled: false },
    credits: { enabled: false }
  };

  // Chart: Workflow Funnel
  const workflowFunnelChart: Highcharts.Options = {
    chart: {
      type: 'bar',
      backgroundColor: 'transparent',
      height: 280
    },
    title: {
      text: 'Purchase Order Pipeline',
      align: 'center',
      style: { fontSize: '14px', fontWeight: 'bold', color: '#1f2937' }
    },
    xAxis: {
      categories: ['New Requests', 'Pending TD', 'Approved', 'Completed'],
      labels: { style: { fontSize: '11px', color: '#374151' } }
    },
    yAxis: {
      title: { text: '' },
      labels: { style: { fontSize: '11px' } }
    },
    series: [{
      type: 'bar',
      name: 'Orders',
      data: [
        { y: workflowStats.new_requests, color: '#f59e0b' },
        { y: workflowStats.pending_td_approval, color: '#3b82f6' },
        { y: workflowStats.vendor_approved, color: '#6366f1' },
        { y: workflowStats.purchase_completed, color: '#10b981' }
      ]
    }],
    plotOptions: {
      bar: {
        borderRadius: 6,
        dataLabels: { enabled: true, format: '{point.y}', style: { fontSize: '12px', fontWeight: '600' } }
      }
    },
    legend: { enabled: false },
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
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <ShoppingCartIcon className="w-6 h-6 text-[#243d8a]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#243d8a]">Buyer Dashboard</h1>
                <p className="text-sm text-gray-500">Procurement Overview & Workflow</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Completion Rate</p>
                <p className="text-2xl font-bold text-green-600">{completionRate}%</p>
              </div>
              <div className="w-16 h-16">
                <svg viewBox="0 0 36 36" className="w-full h-full">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3"
                    strokeDasharray={`${completionRate}, 100`}
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Summary Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { title: 'Total Orders', value: workflowStats.total_orders, icon: DocumentTextIcon, color: 'text-purple-500', bg: 'bg-purple-50' },
            { title: 'Total Materials', value: stats.total_materials, icon: CubeIcon, color: 'text-indigo-500', bg: 'bg-indigo-50' },
            { title: 'Pending', value: stats.pending_purchase, icon: ClockIcon, color: 'text-yellow-500', bg: 'bg-yellow-50' },
            { title: 'In Progress', value: stats.ordered, icon: ShoppingCartIcon, color: 'text-blue-500', bg: 'bg-blue-50' },
            { title: 'Completed', value: stats.delivered, icon: CheckCircleIcon, color: 'text-green-500', bg: 'bg-green-50' },
            { title: 'Total Value', value: `AED ${stats.total_cost.toLocaleString()}`, icon: CurrencyDollarIcon, color: 'text-orange-500', bg: 'bg-orange-50' },
          ].map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{card.title}</p>
                  <p className="text-lg font-bold text-gray-900">
                    {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Workflow Pipeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
        >
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-[#243d8a]" />
            Purchase Order Workflow Pipeline
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {workflowSteps.map((step, index) => (
              <div key={step.title} className="relative">
                <div className={`${step.bgColor} ${step.borderColor} border rounded-xl p-4`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 ${step.color} rounded-lg`}>
                      <step.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{step.title}</p>
                      <p className="text-3xl font-bold text-gray-900">{step.count}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">{step.description}</p>
                </div>
                {index < workflowSteps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                    <ArrowRightIcon className="w-4 h-4 text-gray-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <HighchartsReact highcharts={Highcharts} options={costBreakdownChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <HighchartsReact highcharts={Highcharts} options={materialsChart} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <HighchartsReact highcharts={Highcharts} options={workflowFunnelChart} />
          </motion.div>
        </div>

        {/* Projects & Recent Purchases Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Projects */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
          >
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <BuildingOfficeIcon className="w-5 h-5 text-[#243d8a]" />
              Top Projects by Value
            </h2>
            {projects.length > 0 ? (
              <div className="space-y-3">
                {projects.map((project, index) => (
                  <div key={project.project_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 flex items-center justify-center bg-[#243d8a] text-white text-xs font-bold rounded-full">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{project.project_name}</p>
                        <p className="text-xs text-gray-500">
                          {project.total_orders} orders • {project.completed} completed
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">AED {project.total_cost.toLocaleString()}</p>
                      <div className="w-20 h-1.5 bg-gray-200 rounded-full mt-1">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${project.total_orders > 0 ? (project.completed / project.total_orders * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No project data available</p>
            )}
          </motion.div>

          {/* Recent Purchases */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <TruckIcon className="w-5 h-5 text-[#243d8a]" />
                Recent Purchase Orders
              </h2>
              <button
                onClick={() => navigate('/buyer/purchase-orders')}
                className="text-sm text-[#243d8a] hover:underline font-medium"
              >
                View All →
              </button>
            </div>
            {recentPurchases.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {recentPurchases.slice(0, 5).map((purchase, index) => (
                  <div
                    key={purchase.po_child_id ? `po-child-${purchase.po_child_id}` : `cr-${purchase.cr_id}-${index}`}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                    onClick={() => navigate(`/buyer/purchase-orders?cr_id=${purchase.cr_id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-800 text-sm truncate">
                          {purchase.formatted_id || `PO-${purchase.cr_id}`}
                        </p>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(purchase.status)}`}>
                          {purchase.status_display || purchase.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {purchase.project_name} • {purchase.materials_count} materials
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-bold text-gray-900 text-sm">AED {purchase.total_cost.toLocaleString()}</p>
                      <p className="text-xs text-gray-400">{formatDate(purchase.updated_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No recent purchases</p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(BuyerDashboard);
