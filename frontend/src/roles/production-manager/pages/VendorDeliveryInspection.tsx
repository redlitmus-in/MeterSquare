import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  RefreshCw,
  ClipboardCheck,
  History,
  Package,
  Eye,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Building2,
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  ShieldCheck,
  Filter,
} from 'lucide-react';
import { vendorInspectionService } from '@/services/vendorInspectionService';
import { showSuccess, showError } from '@/utils/toastHelper';
import InspectionForm from '../components/InspectionForm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Use flexible record types - backend API shapes may vary
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PendingInspection = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InspectionHistoryItem = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HeldMaterial = Record<string, any>;

type TabType = 'pending' | 'history' | 'held';

const ITEMS_PER_PAGE = 10;

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

const getInspectionStatusBadge = (status: string) => {
  const config: Record<string, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
    fully_approved: {
      label: 'Fully Approved',
      bg: 'bg-emerald-50 border-emerald-200',
      text: 'text-emerald-700',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    partially_approved: {
      label: 'Partially Approved',
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-700',
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    fully_rejected: {
      label: 'Fully Rejected',
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-700',
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
  };

  const c = config[status] || config.fully_approved;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.bg} ${c.text}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
};

const getReturnStatusBadge = (status: string | null) => {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    return_requested: { label: 'Return Requested', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    returned: { label: 'Returned', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    disposed: { label: 'Disposed', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  };
  const s = status ?? 'pending';
  const c = map[s] || map.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${c.cls}`}>
      {c.label}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

const PageSkeleton: React.FC = () => (
  <div className="min-h-screen bg-gray-50">
    <div className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between animate-pulse">
          <div>
            <div className="h-8 bg-gray-200 rounded w-64 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-96" />
          </div>
          <div className="h-10 bg-gray-200 rounded-lg w-24" />
        </div>
      </div>
    </div>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-3 gap-4 mb-6 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="h-4 bg-gray-200 rounded w-24 mb-3" />
            <div className="h-8 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
      <div className="space-y-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-4 mb-3">
              <div className="h-6 bg-gray-200 rounded w-40" />
              <div className="h-5 bg-gray-200 rounded-full w-24" />
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, j) => (
                <div key={j}>
                  <div className="h-3 bg-gray-200 rounded w-16 mb-1" />
                  <div className="h-5 bg-gray-200 rounded w-28" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({
  icon,
  title,
  description,
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-4">
    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-gray-400">
      {icon}
    </div>
    <h3 className="text-lg font-semibold text-gray-700 mb-1">{title}</h3>
    <p className="text-sm text-gray-500 text-center max-w-md">{description}</p>
  </div>
);

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, totalItems, onPageChange }) => {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);

  return (
    <div className="flex items-center justify-between px-1 py-4">
      <p className="text-sm text-gray-600">
        Showing <span className="font-medium">{startItem}</span> to{' '}
        <span className="font-medium">{endItem}</span> of{' '}
        <span className="font-medium">{totalItems}</span> results
      </p>
      <div className="flex items-center gap-2">
        <button
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
          .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
            if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
              acc.push('ellipsis');
            }
            acc.push(p);
            return acc;
          }, [])
          .map((item, idx) =>
            item === 'ellipsis' ? (
              <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">
                ...
              </span>
            ) : (
              <button
                key={item}
                onClick={() => onPageChange(item as number)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  currentPage === item
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {item}
              </button>
            ),
          )}
        <button
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const VendorDeliveryInspection: React.FC = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('pending');

  // Data state
  const [pendingInspections, setPendingInspections] = useState<PendingInspection[]>([]);
  const [inspectionHistory, setInspectionHistory] = useState<InspectionHistoryItem[]>([]);
  const [heldMaterials, setHeldMaterials] = useState<HeldMaterial[]>([]);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search & filter
  const [searchTerm, setSearchTerm] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('all');

  // Pagination
  const [pendingPage, setPendingPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [heldPage, setHeldPage] = useState(1);

  // Modal state
  const [inspectionModalOpen, setInspectionModalOpen] = useState(false);
  const [selectedImrId, setSelectedImrId] = useState<number | null>(null);

  // Detail modal (for history)
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<InspectionHistoryItem | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const loadTabData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      if (activeTab === 'pending') {
        const result = await vendorInspectionService.getPendingInspections();
        setPendingInspections(result?.data ?? result ?? []);
      } else if (activeTab === 'history') {
        const result = await vendorInspectionService.getInspectionHistory();
        setInspectionHistory(result?.data ?? result ?? []);
      } else if (activeTab === 'held') {
        const result = await vendorInspectionService.getHeldMaterials();
        setHeldMaterials(result?.data ?? result ?? []);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load inspection data';
      showError(message);
      if (import.meta.env.DEV) {
        console.error('VendorDeliveryInspection fetch error:', err);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  // Reset pagination when search/tab changes
  useEffect(() => {
    setPendingPage(1);
    setHistoryPage(1);
    setHeldPage(1);
  }, [searchTerm, activeTab, historyStatusFilter]);

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  const filteredPending = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return pendingInspections.filter((item) => {
      if (!searchTerm) return true;
      return (
        item.vendor_name?.toLowerCase().includes(lowerSearch) ||
        item.project_name?.toLowerCase().includes(lowerSearch) ||
        String(item.cr_id).includes(lowerSearch) ||
        String(item.imr_id).includes(lowerSearch)
      );
    });
  }, [pendingInspections, searchTerm]);

  const filteredHistory = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return inspectionHistory.filter((item) => {
      if (historyStatusFilter !== 'all' && item.overall_status !== historyStatusFilter) return false;
      if (!searchTerm) return true;
      return (
        item.vendor_name?.toLowerCase().includes(lowerSearch) ||
        item.project_name?.toLowerCase().includes(lowerSearch) ||
        String(item.cr_id).includes(lowerSearch) ||
        item.inspector_name?.toLowerCase().includes(lowerSearch)
      );
    });
  }, [inspectionHistory, searchTerm, historyStatusFilter]);

  const filteredHeld = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return heldMaterials.filter((item) => {
      if (!searchTerm) return true;
      return (
        item.material_name?.toLowerCase().includes(lowerSearch) ||
        item.vendor_name?.toLowerCase().includes(lowerSearch) ||
        item.rejection_category?.toLowerCase().includes(lowerSearch) ||
        String(item.cr_id).includes(lowerSearch)
      );
    });
  }, [heldMaterials, searchTerm]);

  // -------------------------------------------------------------------------
  // Pagination logic
  // -------------------------------------------------------------------------

  const paginatedPending = filteredPending.slice(
    (pendingPage - 1) * ITEMS_PER_PAGE,
    pendingPage * ITEMS_PER_PAGE,
  );
  const totalPendingPages = Math.ceil(filteredPending.length / ITEMS_PER_PAGE);

  const paginatedHistory = filteredHistory.slice(
    (historyPage - 1) * ITEMS_PER_PAGE,
    historyPage * ITEMS_PER_PAGE,
  );
  const totalHistoryPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE);

  const paginatedHeld = filteredHeld.slice(
    (heldPage - 1) * ITEMS_PER_PAGE,
    heldPage * ITEMS_PER_PAGE,
  );
  const totalHeldPages = Math.ceil(filteredHeld.length / ITEMS_PER_PAGE);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleOpenInspection = (imrId: number) => {
    setSelectedImrId(imrId);
    setInspectionModalOpen(true);
  };

  const handleInspectionComplete = () => {
    setInspectionModalOpen(false);
    setSelectedImrId(null);
    showSuccess('Inspection submitted successfully');
    loadTabData(true);
  };

  const handleViewHistoryDetail = (item: InspectionHistoryItem) => {
    setSelectedHistoryItem(item);
    setDetailModalOpen(true);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '--';
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return <PageSkeleton />;
  }

  // -------------------------------------------------------------------------
  // Tab definitions
  // -------------------------------------------------------------------------

  const tabs: { key: TabType; label: string; icon: React.ReactNode; count: number }[] = [
    {
      key: 'pending',
      label: 'Pending Inspections',
      icon: <ClipboardCheck className="w-4 h-4" />,
      count: pendingInspections.length,
    },
    {
      key: 'history',
      label: 'Inspection History',
      icon: <History className="w-4 h-4" />,
      count: inspectionHistory.length,
    },
    {
      key: 'held',
      label: 'Held Materials',
      icon: <Package className="w-4 h-4" />,
      count: heldMaterials.length,
    },
  ];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ---------- Header ---------- */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  Vendor Delivery Inspection
                </h1>
                <p className="mt-0.5 text-sm text-gray-500">
                  Inspect vendor deliveries, approve or reject materials, and track held stock
                </p>
              </div>
            </div>

            <button
              onClick={() => loadTabData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* ---------- Summary Cards ---------- */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Awaiting Inspection</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{pendingInspections.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-500" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide">Total Inspections</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{inspectionHistory.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
                <ClipboardCheck className="w-6 h-6 text-indigo-500" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-rose-600 uppercase tracking-wide">Held Materials</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{heldMaterials.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center">
                <RotateCcw className="w-6 h-6 text-rose-500" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* ---------- Tabs ---------- */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1 mb-6">
          <div className="flex flex-wrap gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                <span
                  className={`ml-1 px-1.5 py-0.5 text-xs font-bold rounded-full ${
                    activeTab === tab.key
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ---------- Search bar ---------- */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={
                  activeTab === 'pending'
                    ? 'Search by vendor, project, CR ID, or IMR ID...'
                    : activeTab === 'history'
                    ? 'Search by vendor, project, CR ID, or inspector...'
                    : 'Search by material, vendor, category, or CR ID...'
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
            </div>

            {/* History status filter */}
            {activeTab === 'history' && (
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={historyStatusFilter}
                  onChange={(e) => setHistoryStatusFilter(e.target.value)}
                  className="pl-9 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white appearance-none cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="fully_approved">Fully Approved</option>
                  <option value="partially_approved">Partially Approved</option>
                  <option value="fully_rejected">Fully Rejected</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* ---------- Tab Content ---------- */}
        <AnimatePresence mode="wait">
          {/* ===== PENDING INSPECTIONS ===== */}
          {activeTab === 'pending' && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
            >
              {filteredPending.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                  <EmptyState
                    icon={<ClipboardCheck className="w-8 h-8" />}
                    title="No Pending Inspections"
                    description="All vendor deliveries have been inspected. New deliveries will appear here when vendors deliver materials to the M2 Store."
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {paginatedPending.map((item) => (
                      <motion.div
                        key={item.imr_id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
                      >
                        <div className="p-5 sm:p-6">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                            {/* Left section */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-3">
                                <h3 className="text-lg font-semibold text-gray-900 truncate">
                                  IMR #{item.imr_id}
                                </h3>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                  <Clock className="w-3 h-3" />
                                  Pending Inspection
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                                <div className="flex items-start gap-2">
                                  <Building2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                  <div>
                                    <p className="text-gray-500 text-xs">Vendor</p>
                                    <p className="font-medium text-gray-900">{item.vendor_name}</p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-2">
                                  <Layers className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                  <div>
                                    <p className="text-gray-500 text-xs">Project</p>
                                    <p className="font-medium text-gray-900">{item.project_name}</p>
                                    {item.project_code && (
                                      <p className="text-xs text-gray-400">{item.project_code}</p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-start gap-2">
                                  <Package className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                  <div>
                                    <p className="text-gray-500 text-xs">Materials</p>
                                    <p className="font-medium text-gray-900">
                                      {item.materials_count} item{item.materials_count !== 1 ? 's' : ''}
                                    </p>
                                    {item.materials_summary && item.materials_summary.length > 0 && (
                                      <p className="text-xs text-gray-400 truncate max-w-[180px]">
                                        {item.materials_summary.slice(0, 2).join(', ')}
                                        {item.materials_summary.length > 2
                                          ? ` +${item.materials_summary.length - 2} more`
                                          : ''}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-start gap-2">
                                  <Calendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                                  <div>
                                    <p className="text-gray-500 text-xs">Delivery Date</p>
                                    <p className="font-medium text-gray-900">
                                      {formatDate(item.delivery_date)}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* CR ID badge */}
                              <div className="mt-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                  CR-{item.cr_id}
                                </span>
                              </div>
                            </div>

                            {/* Action button */}
                            <div className="flex-shrink-0">
                              <button
                                onClick={() => handleOpenInspection(item.imr_id)}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 font-medium text-sm transition-colors shadow-sm"
                              >
                                <ClipboardCheck className="w-4 h-4" />
                                Inspect
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <Pagination
                    currentPage={pendingPage}
                    totalPages={totalPendingPages}
                    totalItems={filteredPending.length}
                    onPageChange={setPendingPage}
                  />
                </>
              )}
            </motion.div>
          )}

          {/* ===== INSPECTION HISTORY ===== */}
          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
            >
              {filteredHistory.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                  <EmptyState
                    icon={<History className="w-8 h-8" />}
                    title="No Inspection History"
                    description="Completed inspections will appear here. Start by inspecting a pending vendor delivery."
                  />
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Inspection
                            </th>
                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Vendor
                            </th>
                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Project
                            </th>
                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Date
                            </th>
                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Result
                            </th>
                            <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Materials
                            </th>
                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Inspector
                            </th>
                            <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {paginatedHistory.map((item) => (
                            <tr
                              key={item.inspection_id}
                              className="hover:bg-gray-50/50 transition-colors"
                            >
                              <td className="px-5 py-4 text-sm">
                                <div>
                                  <span className="font-semibold text-gray-900">
                                    #{item.inspection_id}
                                  </span>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    CR-{item.cr_id}
                                  </p>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-sm font-medium text-gray-900">
                                {item.vendor_name}
                              </td>
                              <td className="px-5 py-4 text-sm text-gray-700">
                                {item.project_name}
                              </td>
                              <td className="px-5 py-4 text-sm text-gray-600">
                                {formatDate(item.inspection_date)}
                              </td>
                              <td className="px-5 py-4">
                                {getInspectionStatusBadge(item.overall_status)}
                              </td>
                              <td className="px-5 py-4 text-center text-sm">
                                <div className="flex items-center justify-center gap-2">
                                  <span className="text-emerald-600 font-medium">
                                    {item.accepted_count}
                                  </span>
                                  <span className="text-gray-300">/</span>
                                  <span className="text-red-600 font-medium">
                                    {item.rejected_count}
                                  </span>
                                  <span className="text-gray-400 text-xs">
                                    of {item.total_materials}
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-sm text-gray-700">
                                {item.inspector_name}
                              </td>
                              <td className="px-5 py-4 text-right">
                                <button
                                  onClick={() => handleViewHistoryDetail(item)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                  View
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <Pagination
                    currentPage={historyPage}
                    totalPages={totalHistoryPages}
                    totalItems={filteredHistory.length}
                    onPageChange={setHistoryPage}
                  />
                </>
              )}
            </motion.div>
          )}

          {/* ===== HELD MATERIALS ===== */}
          {activeTab === 'held' && (
            <motion.div
              key="held"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2 }}
            >
              {filteredHeld.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                  <EmptyState
                    icon={<Package className="w-8 h-8" />}
                    title="No Held Materials"
                    description="Rejected materials that are being held for return or disposal will appear here."
                  />
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Material
                            </th>
                            <th className="text-center px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Qty
                            </th>
                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Rejection Reason
                            </th>
                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Category
                            </th>
                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Vendor
                            </th>
                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Inspection Date
                            </th>
                            <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              Return Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {paginatedHeld.map((item) => (
                            <tr
                              key={item.held_material_id}
                              className="hover:bg-gray-50/50 transition-colors"
                            >
                              <td className="px-5 py-4">
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    {item.material_name}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {item.brand && (
                                      <span className="text-xs text-gray-500">
                                        {item.brand}
                                      </span>
                                    )}
                                    {item.size && (
                                      <span className="text-xs text-gray-400">
                                        | {item.size}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs text-gray-400 mt-0.5">
                                    CR-{item.cr_id}
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-center">
                                <span className="text-sm font-bold text-gray-900">
                                  {item.quantity}
                                </span>
                                {item.unit && (
                                  <span className="text-xs text-gray-500 ml-1">
                                    {item.unit}
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-4 text-sm text-gray-700 max-w-[200px]">
                                <p className="truncate" title={item.rejection_reason}>
                                  {item.rejection_reason || '--'}
                                </p>
                              </td>
                              <td className="px-5 py-4">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                                  {item.rejection_category}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-sm text-gray-700">
                                {item.vendor_name}
                              </td>
                              <td className="px-5 py-4 text-sm text-gray-600">
                                {formatDate(item.inspection_date)}
                              </td>
                              <td className="px-5 py-4">
                                {getReturnStatusBadge(item.return_request_status)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <Pagination
                    currentPage={heldPage}
                    totalPages={totalHeldPages}
                    totalItems={filteredHeld.length}
                    onPageChange={setHeldPage}
                  />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ---------- Inspection Form Modal ---------- */}
      <InspectionForm
        isOpen={inspectionModalOpen}
        onClose={() => {
          setInspectionModalOpen(false);
          setSelectedImrId(null);
        }}
        imrId={selectedImrId}
        onInspectionComplete={handleInspectionComplete}
      />

      {/* ---------- History Detail Modal ---------- */}
      <AnimatePresence>
        {detailModalOpen && selectedHistoryItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50"
              onClick={() => setDetailModalOpen(false)}
            />

            {/* Modal content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Inspection #{selectedHistoryItem.inspection_id}
                    </h3>
                    <p className="text-sm text-indigo-100 mt-0.5">
                      CR-{selectedHistoryItem.cr_id} | IMR #{selectedHistoryItem.imr_id}
                    </p>
                  </div>
                  <button
                    onClick={() => setDetailModalOpen(false)}
                    className="text-white/80 hover:text-white transition-colors"
                    aria-label="Close detail modal"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Vendor</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {selectedHistoryItem.vendor_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Project</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {selectedHistoryItem.project_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Inspection Date</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {formatDate(selectedHistoryItem.inspection_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Inspector</p>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      {selectedHistoryItem.inspector_name}
                    </p>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Result</p>
                  {getInspectionStatusBadge(selectedHistoryItem.overall_status)}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-gray-900">
                      {selectedHistoryItem.total_materials}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Total</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-700">
                      {selectedHistoryItem.accepted_count}
                    </p>
                    <p className="text-xs text-emerald-600 mt-0.5">Accepted</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">
                      {selectedHistoryItem.rejected_count}
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">Rejected</p>
                  </div>
                </div>

                {selectedHistoryItem.notes && (
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-line">
                      {selectedHistoryItem.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => setDetailModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VendorDeliveryInspection;
