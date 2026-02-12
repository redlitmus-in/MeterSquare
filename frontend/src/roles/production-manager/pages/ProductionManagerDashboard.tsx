import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  AlertTriangle,
  RefreshCw,
  Box,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  DollarSign,
  Truck,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  RotateCcw,
  Activity,
  Bell,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  FileText
} from 'lucide-react';
import { inventoryService } from '../services/inventoryService';

// Route constants
const ROUTES = {
  STOCK: '/production-manager/m2-store/stock',
  REQUESTS: '/production-manager/m2-store/requests',
  STOCK_IN: '/production-manager/m2-store/stock-in',
  STOCK_OUT: '/production-manager/m2-store/stock-out',
  DISPATCH: '/production-manager/m2-store/dispatch',
  REPORTS: '/production-manager/m2-store/reports',
  DELIVERY_NOTES: '/production-manager/m2-store/delivery-notes',
  RETURNS: '/production-manager/m2-store/returns'
} as const;

// Dashboard Data Interface
interface DashboardData {
  // Stock Overview
  totalItems: number;
  totalValue: number;
  totalBackupValue: number;
  healthyStockItems: number;
  lowStockItems: number;
  criticalItems: number;
  outOfStockItems: number;
  stockAlerts: Array<{
    name: string;
    stock: number;
    unit: string;
    status: string;
    material_code: string;
    category: string;
  }>;
  categories: Array<{
    name: string;
    count: number;
    value: number;
    stock: number;
  }>;

  // Delivery Notes
  deliveryNotesStatus: {
    draft: number;
    issued: number;
    in_transit: number;
    delivered: number;
    partial: number;
    cancelled: number;
    total: number;
    pending_action: number;
  };
  returnNotesStatus: {
    draft: number;
    issued: number;
    in_transit: number;
    received: number;
    partial: number;
    total: number;
    incoming: number;
  };
  recentDeliveryNotes: Array<{
    delivery_note_id: number;
    delivery_note_number: string;
    project_name: string;
    status: string;
    total_items: number;
    created_at: string;
    attention_to: string;
  }>;

  // Material Requests
  materialRequestsStatus: {
    pending: number;
    awaiting_vendor: number;
    approved: number;
    dn_pending: number;
    dispatched: number;
    fulfilled: number;
    rejected: number;
    total_active: number;
    needs_action: number;
  };

  // Returns & Disposal
  returnsStatus: {
    pending_approval: number;
    pending_review: number;
    sent_for_repair: number;
    approved: number;
    disposed: number;
    by_condition: {
      good: number;
      damaged: number;
      defective: number;
    };
    needs_action: number;
  };

  // Transactions
  recentTransactions: Array<{
    transaction_type: string;
    quantity: number;
    total_amount: number;
    created_at: string;
    material_name?: string;
    material_code?: string;
  }>;
  stockMovement: {
    period: string;
    purchases: { quantity: number; value: number };
    withdrawals: { quantity: number; value: number };
  };

  // Projects
  topProjects: Array<{
    project_id: number;
    project_name: string;
    total_delivery_notes: number;
    delivered: number;
  }>;

  // Activity
  todayActivity: {
    transactions: number;
    delivery_notes_created: number;
    delivery_notes_dispatched: number;
  };

  // Pending Actions
  pendingActions: {
    delivery_notes_to_issue: number;
    delivery_notes_to_dispatch: number;
    material_requests_to_process: number;
    returns_to_process: number;
    incoming_returns: number;
    total: number;
  };

  // Legacy
  totalTransactions: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
}

// Stat Card Component
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'cyan' | 'indigo' | 'amber';
  onClick?: () => void;
  badge?: number;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon, color, onClick, badge }) => {
  const colorStyles = {
    blue: { border: 'border-l-blue-500', icon: 'bg-blue-50 text-blue-600' },
    green: { border: 'border-l-green-500', icon: 'bg-green-50 text-green-600' },
    orange: { border: 'border-l-orange-500', icon: 'bg-orange-50 text-orange-600' },
    purple: { border: 'border-l-purple-500', icon: 'bg-purple-50 text-purple-600' },
    red: { border: 'border-l-red-500', icon: 'bg-red-50 text-red-600' },
    cyan: { border: 'border-l-cyan-500', icon: 'bg-cyan-50 text-cyan-600' },
    indigo: { border: 'border-l-indigo-500', icon: 'bg-indigo-50 text-indigo-600' },
    amber: { border: 'border-l-amber-500', icon: 'bg-amber-50 text-amber-600' }
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border border-gray-200 border-l-4 ${colorStyles[color].border} p-4 relative ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorStyles[color].icon}`}>
          {icon}
        </div>
      </div>
    </div>
  );
};

// Mini Stat Component
interface MiniStatProps {
  label: string;
  value: number;
  color: string;
}

const MiniStat: React.FC<MiniStatProps> = ({ label, value, color }) => (
  <div className="flex items-center justify-between py-2">
    <span className="text-sm text-gray-600">{label}</span>
    <span className={`text-sm font-semibold ${color}`}>{value}</span>
  </div>
);

// Status Badge Component
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    ISSUED: 'bg-blue-100 text-blue-700',
    IN_TRANSIT: 'bg-amber-100 text-amber-700',
    DELIVERED: 'bg-green-100 text-green-700',
    PARTIAL: 'bg-purple-100 text-purple-700',
    CANCELLED: 'bg-red-100 text-red-700',
    RECEIVED: 'bg-green-100 text-green-700'
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

const ProductionManagerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const dashboardData = await inventoryService.getDashboardData();
      // Apply defaults for missing fields to prevent runtime errors
      const safeData: DashboardData = {
        totalItems: dashboardData?.totalItems || 0,
        totalValue: dashboardData?.totalValue || 0,
        totalBackupValue: dashboardData?.totalBackupValue || 0,
        healthyStockItems: dashboardData?.healthyStockItems || 0,
        lowStockItems: dashboardData?.lowStockItems || 0,
        criticalItems: dashboardData?.criticalItems || 0,
        outOfStockItems: dashboardData?.outOfStockItems || 0,
        stockAlerts: dashboardData?.stockAlerts || [],
        categories: dashboardData?.categories || [],
        deliveryNotesStatus: dashboardData?.deliveryNotesStatus || { draft: 0, issued: 0, in_transit: 0, delivered: 0, partial: 0, cancelled: 0, total: 0, pending_action: 0 },
        returnNotesStatus: dashboardData?.returnNotesStatus || { draft: 0, issued: 0, in_transit: 0, received: 0, partial: 0, total: 0, incoming: 0 },
        recentDeliveryNotes: dashboardData?.recentDeliveryNotes || [],
        materialRequestsStatus: dashboardData?.materialRequestsStatus || { pending: 0, awaiting_vendor: 0, approved: 0, dn_pending: 0, dispatched: 0, fulfilled: 0, rejected: 0, total_active: 0, needs_action: 0 },
        returnsStatus: dashboardData?.returnsStatus || { pending_approval: 0, pending_review: 0, sent_for_repair: 0, approved: 0, disposed: 0, by_condition: { good: 0, damaged: 0, defective: 0 }, needs_action: 0 },
        recentTransactions: dashboardData?.recentTransactions || [],
        stockMovement: dashboardData?.stockMovement || { period: '30_days', purchases: { quantity: 0, value: 0 }, withdrawals: { quantity: 0, value: 0 } },
        topProjects: dashboardData?.topProjects || [],
        todayActivity: dashboardData?.todayActivity || { transactions: 0, delivery_notes_created: 0, delivery_notes_dispatched: 0 },
        pendingActions: dashboardData?.pendingActions || { delivery_notes_to_issue: 0, delivery_notes_to_dispatch: 0, material_requests_to_process: 0, returns_to_process: 0, incoming_returns: 0, total: 0 },
        totalTransactions: dashboardData?.totalTransactions || 0,
        pendingRequests: dashboardData?.pendingRequests || 0,
        approvedRequests: dashboardData?.approvedRequests || 0,
        rejectedRequests: dashboardData?.rejectedRequests || 0
      };
      setData(safeData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toFixed(0)}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const getStockHealthPercent = () => {
    if (!data || data.totalItems === 0) return 0;
    return Math.round((data.healthyStockItems / data.totalItems) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-xl font-semibold text-gray-700">Unable to load dashboard</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  const stockHealth = getStockHealthPercent();
  const totalAlerts = data.lowStockItems + data.criticalItems + data.outOfStockItems;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Production Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">M2 Store inventory and operations overview</p>
          </div>
          <div className="flex items-center gap-3 mt-4 sm:mt-0">
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-white px-3 py-2 rounded-lg border">
              <Clock className="w-3.5 h-3.5" />
              <span>{lastUpdated.toLocaleTimeString()}</span>
              <span className="text-gray-300">|</span>
              <span>{lastUpdated.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
            <button
              onClick={() => fetchDashboardData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {data.pendingActions.total > 0 && (
              <div className="relative">
                <Bell className="w-5 h-5 text-gray-600" />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {data.pendingActions.total > 9 ? '9+' : data.pendingActions.total}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Primary Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Materials"
            value={data.totalItems}
            subtitle="Active items in store"
            icon={<Layers className="w-5 h-5" />}
            color="blue"
          />
          <StatCard
            title="Inventory Value"
            value={formatCurrency(data.totalValue)}
            subtitle={`${data.categories.length} categories`}
            icon={<DollarSign className="w-5 h-5" />}
            color="green"
          />
          <StatCard
            title="Stock Alerts"
            value={totalAlerts}
            subtitle={`${data.criticalItems} critical`}
            icon={<AlertTriangle className="w-5 h-5" />}
            color={totalAlerts > 0 ? 'orange' : 'green'}
            badge={data.criticalItems}
          />
          <StatCard
            title="Pending Actions"
            value={data.pendingActions.total}
            subtitle="Requires attention"
            icon={<ClipboardList className="w-5 h-5" />}
            color="purple"
            badge={data.pendingActions.total}
          />
        </div>

        {/* Secondary Stats Row - Delivery & Returns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Delivery Notes"
            value={data.deliveryNotesStatus.total}
            subtitle={`${data.deliveryNotesStatus.in_transit} in transit`}
            icon={<Truck className="w-5 h-5" />}
            color="cyan"
            badge={data.deliveryNotesStatus.pending_action}
          />
          <StatCard
            title="Material Requests"
            value={data.materialRequestsStatus.total_active}
            subtitle={`${data.materialRequestsStatus.pending} pending`}
            icon={<FileText className="w-5 h-5" />}
            color="indigo"
            badge={data.materialRequestsStatus.needs_action}
          />
          <StatCard
            title="Incoming Returns"
            value={data.returnNotesStatus.incoming}
            subtitle={`${data.returnNotesStatus.total} total RDNs`}
            icon={<RotateCcw className="w-5 h-5" />}
            color="amber"
            badge={data.returnNotesStatus.incoming}
          />
          <StatCard
            title="Stock Movement"
            value={`+${data.stockMovement.purchases.quantity.toFixed(0)}`}
            subtitle={`-${data.stockMovement.withdrawals.quantity.toFixed(0)} (30 days)`}
            icon={<Activity className="w-5 h-5" />}
            color="blue"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Stock Health Overview */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Stock Health</h3>
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${stockHealth >= 80 ? 'bg-green-500' : stockHealth >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="text-lg font-bold">{stockHealth}%</span>
              </div>
            </div>

            {/* Health Bar */}
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div
                className={`h-full transition-all ${stockHealth >= 80 ? 'bg-green-500' : stockHealth >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${stockHealth}%` }}
              />
            </div>

            {/* Stock Breakdown */}
            <div className="space-y-1 divide-y divide-gray-100">
              <MiniStat label="Healthy Stock" value={data.healthyStockItems} color="text-green-600" />
              <MiniStat label="Low Stock" value={data.lowStockItems} color="text-amber-600" />
              <MiniStat label="Critical" value={data.criticalItems} color="text-orange-600" />
              <MiniStat label="Out of Stock" value={data.outOfStockItems} color="text-red-600" />
            </div>

            {data.totalBackupValue > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Backup Stock Value</span>
                  <span className="text-sm font-medium text-purple-600">{formatCurrency(data.totalBackupValue)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Delivery Notes Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Delivery Notes</h3>
              <button
                onClick={() => navigate(ROUTES.DELIVERY_NOTES)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View All <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-gray-700">{data.deliveryNotesStatus.draft}</p>
                <p className="text-xs text-gray-500">Draft</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{data.deliveryNotesStatus.issued}</p>
                <p className="text-xs text-blue-600">Issued</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{data.deliveryNotesStatus.in_transit}</p>
                <p className="text-xs text-amber-600">In Transit</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-600">{data.deliveryNotesStatus.delivered}</p>
                <p className="text-xs text-green-600">Delivered</p>
              </div>
            </div>

            {data.deliveryNotesStatus.pending_action > 0 && (
              <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-sm text-orange-800">
                  <span className="font-semibold">{data.deliveryNotesStatus.pending_action}</span> delivery notes need your action
                </p>
              </div>
            )}
          </div>

          {/* Material Requests Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Material Requests</h3>
              <button
                onClick={() => navigate(ROUTES.REQUESTS)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View All <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 divide-y divide-gray-100">
              <MiniStat label="Pending Approval" value={data.materialRequestsStatus.pending} color="text-amber-600" />
              <MiniStat label="Awaiting Vendor" value={data.materialRequestsStatus.awaiting_vendor} color="text-blue-600" />
              <MiniStat label="Approved" value={data.materialRequestsStatus.approved} color="text-green-600" />
              <MiniStat label="DN Pending" value={data.materialRequestsStatus.dn_pending} color="text-purple-600" />
              <MiniStat label="Dispatched" value={data.materialRequestsStatus.dispatched} color="text-cyan-600" />
              <MiniStat label="Fulfilled" value={data.materialRequestsStatus.fulfilled} color="text-gray-600" />
            </div>

            {data.materialRequestsStatus.needs_action > 0 && (
              <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <p className="text-sm text-indigo-800">
                  <span className="font-semibold">{data.materialRequestsStatus.needs_action}</span> requests need processing
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Second Row - Categories, Returns, Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Top Categories */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Top Categories</h3>
              <button
                onClick={() => navigate(ROUTES.STOCK)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View All <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {data.categories.slice(0, 5).map((cat, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Package className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{cat.name}</p>
                      <p className="text-xs text-gray-500">{cat.count} items</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(cat.value)}</p>
                </div>
              ))}
              {data.categories.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No categories found</p>
              )}
            </div>
          </div>

          {/* Returns & Disposal */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Returns & Disposal</h3>
              <button
                onClick={() => navigate(ROUTES.RETURNS)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View All <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* By Condition */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-green-600">{data.returnsStatus.by_condition.good}</p>
                <p className="text-xs text-green-700">Good</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-amber-600">{data.returnsStatus.by_condition.damaged}</p>
                <p className="text-xs text-amber-700">Damaged</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-red-600">{data.returnsStatus.by_condition.defective}</p>
                <p className="text-xs text-red-700">Defective</p>
              </div>
            </div>

            {/* Status breakdown */}
            <div className="space-y-1 divide-y divide-gray-100">
              <MiniStat label="Pending Approval" value={data.returnsStatus.pending_approval} color="text-amber-600" />
              <MiniStat label="Sent for Repair" value={data.returnsStatus.sent_for_repair} color="text-blue-600" />
              <MiniStat label="Approved" value={data.returnsStatus.approved} color="text-green-600" />
              <MiniStat label="Disposed" value={data.returnsStatus.disposed} color="text-gray-600" />
            </div>
          </div>

          {/* Today's Activity */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Today's Activity</h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-gray-700">Transactions</span>
                </div>
                <span className="text-lg font-bold text-blue-600">{data.todayActivity.transactions}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-gray-700">DNs Created</span>
                </div>
                <span className="text-lg font-bold text-green-600">{data.todayActivity.delivery_notes_created}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Truck className="w-5 h-5 text-purple-600" />
                  <span className="text-sm text-gray-700">DNs Dispatched</span>
                </div>
                <span className="text-lg font-bold text-purple-600">{data.todayActivity.delivery_notes_dispatched}</span>
              </div>

              {/* 30-Day Stock Movement */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-3">30-Day Stock Movement</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowDownToLine className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-gray-600">In</span>
                  </div>
                  <span className="text-sm font-semibold text-green-600">{formatCurrency(data.stockMovement.purchases.value)}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <ArrowUpFromLine className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-gray-600">Out</span>
                  </div>
                  <span className="text-sm font-semibold text-red-600">{formatCurrency(data.stockMovement.withdrawals.value)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row - Recent Delivery Notes & Transactions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Delivery Notes */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Recent Delivery Notes</h3>
              <button
                onClick={() => navigate(ROUTES.DELIVERY_NOTES)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View All <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {data.recentDeliveryNotes.length > 0 ? (
                data.recentDeliveryNotes.map((dn) => (
                  <div key={dn.delivery_note_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{dn.delivery_note_number}</p>
                        <StatusBadge status={dn.status} />
                      </div>
                      <p className="text-xs text-gray-500 truncate">{dn.project_name}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-xs text-gray-500">{dn.total_items} items</p>
                      <p className="text-xs text-gray-400">{formatDate(dn.created_at)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No delivery notes yet</p>
              )}
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Recent Activity</h3>
              <span className="text-xs text-gray-500">{data.totalTransactions} total</span>
            </div>

            <div className="space-y-3">
              {data.recentTransactions.length > 0 ? (
                data.recentTransactions.slice(0, 5).map((txn, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${txn.transaction_type === 'PURCHASE' ? 'bg-green-100' : 'bg-blue-100'}`}>
                        {txn.transaction_type === 'PURCHASE' ? (
                          <TrendingUp className="w-4 h-4 text-green-600" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{txn.transaction_type}</p>
                        <p className="text-xs text-gray-500">Qty: {txn.quantity}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(txn.total_amount || 0)}</p>
                      <p className="text-xs text-gray-400">{formatDate(txn.created_at)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No transactions yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Critical Alerts Banner */}
        {totalAlerts > 0 && (
          <div className="mt-6 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Stock Alert</h4>
                  <p className="text-sm text-gray-600">
                    {totalAlerts} item{totalAlerts > 1 ? 's' : ''} need attention
                    {data.criticalItems > 0 && <span className="text-red-600 font-medium"> ({data.criticalItems} critical)</span>}
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate(ROUTES.STOCK)}
                className="px-5 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center gap-2"
              >
                View Alerts <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ProductionManagerDashboard);
