import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import {
  DocumentChartBarIcon,
  ArrowLeftIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  ChartBarIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ShoppingCartIcon,
  CurrencyDollarIcon,
  ScaleIcon
} from '@heroicons/react/24/outline';
import { showSuccess, showError, showInfo } from '@/utils/toastHelper';
import { boqTrackingService } from '@/roles/project-manager/services/boqTrackingService';
import { useProjectsAutoSync } from '@/hooks/useAutoSync';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/api/config';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PurchaseDetail {
  cr_id?: number;
  po_child_id?: number;
  vendor_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  purchase_date: string | null;
  vat_percent?: number;
  vat_amount?: number;
}

interface MaterialComparison {
  item_name: string;
  sub_item_name: string;
  material_name: string;
  unit: string;
  planned_quantity: number;
  planned_rate: number;
  planned_amount: number;
  actual_quantity_purchased: number;
  actual_rate: number;
  actual_spent: number;
  quantity_variance: number;
  amount_variance: number;
  quantity_variance_percentage: number;
  amount_variance_percentage: number;
  status: 'over_budget' | 'under_budget' | 'on_budget' | 'unplanned';
  category: 'existing' | 'new' | 'planned_only';
  is_from_change_request: boolean;
  purchase_count: number;
  purchase_details: PurchaseDetail[];
}

interface ComparisonSummary {
  total_materials: number;
  total_planned_amount: number;
  total_actual_spent: number;
  total_variance: number;
  variance_percentage: number;
  over_budget_count: number;
  under_budget_count: number;
  on_budget_count: number;
  unplanned_count: number;
}

interface PurchaseComparisonData {
  project_id: number;
  project_name: string;
  boq_id: number;
  materials: MaterialComparison[];
  summary: ComparisonSummary;
  breakdown: {
    existing_materials: number;
    new_materials: number;
    modified_materials: number;
  };
  analytics: {
    total_planned_cost: number;
    total_actual_cost: number;
    cost_variance: number;
    cost_variance_percentage: number;
    material_count_variance: number;
  };
}

export default function PurchaseComparisonSplitView() {
  const [searchParams] = useSearchParams();
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('live');
  const [comparisonData, setComparisonData] = useState<PurchaseComparisonData | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialComparison | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Real-time auto-sync for BOQ list
  const { data: boqData, isLoading: loading } = useProjectsAutoSync(
    async () => {
      const response = await boqTrackingService.getAllBOQs();
      let allBOQs: any[] = [];

      if (Array.isArray(response)) {
        allBOQs = response;
      } else if (response.boqs && Array.isArray(response.boqs)) {
        allBOQs = response.boqs;
      } else if (response.data && Array.isArray(response.data)) {
        allBOQs = response.data;
      } else if (response.items && Array.isArray(response.items)) {
        allBOQs = response.items;
      }

      return allBOQs.filter((boq: any) => {
        const status = (boq.status || boq.boq_status || '').toLowerCase();
        return status !== 'rejected';
      });
    }
  );

  const boqList = useMemo(() => boqData || [], [boqData]);

  // Filter BOQs based on active tab
  const filteredBOQList = useMemo(() => {
    if (activeTab === 'live') {
      return boqList.filter((boq: any) => {
        const projectStatus = (boq.project_status || '').toLowerCase();
        return projectStatus !== 'completed' && projectStatus !== 'closed';
      });
    } else {
      return boqList.filter((boq: any) => {
        const projectStatus = (boq.project_status || '').toLowerCase();
        return projectStatus === 'completed' || projectStatus === 'closed';
      });
    }
  }, [boqList, activeTab]);

  // Fetch purchase comparison data
  const fetchComparisonData = async (projectId: number) => {
    setLoadingComparison(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await apiClient.get(`/purchase-comparison/${projectId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success) {
        setComparisonData(response.data.data);
        // Auto-select first material for split view
        if (response.data.data.materials && response.data.data.materials.length > 0) {
          setSelectedMaterial(response.data.data.materials[0]);
        }
      } else {
        showError(response.data.error || 'Failed to fetch comparison data');
      }
    } catch (error: any) {
      console.error('Error fetching comparison:', error);
      showError(error.response?.data?.error || 'Failed to fetch purchase comparison');
    } finally {
      setLoadingComparison(false);
    }
  };

  // Auto-select project from URL
  useEffect(() => {
    const projectIdFromUrl = searchParams.get('project_id');
    if (projectIdFromUrl && boqList.length > 0 && !selectedProject) {
      const projectId = parseInt(projectIdFromUrl, 10);
      const project = boqList.find((b: any) => b.project_id === projectId);
      if (project) {
        setSelectedProject(project);
        fetchComparisonData(projectId);
      }
    }
  }, [searchParams, boqList, selectedProject]);

  const handleProjectSelect = async (project: any) => {
    setSelectedProject(project);
    setSelectedMaterial(null);
    await fetchComparisonData(project.project_id);
  };

  const handleBack = () => {
    setSelectedProject(null);
    setComparisonData(null);
    setSelectedMaterial(null);
    setFilterStatus('all');
    setFilterCategory('all');
    setSearchTerm('');
  };

  // Filter materials
  const filteredMaterials = useMemo(() => {
    if (!comparisonData) return [];

    let filtered = comparisonData.materials;

    if (filterStatus !== 'all') {
      filtered = filtered.filter(m => m.status === filterStatus);
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter(m => m.category === filterCategory);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(m =>
        m.material_name.toLowerCase().includes(search) ||
        m.item_name.toLowerCase().includes(search)
      );
    }

    return filtered;
  }, [comparisonData, filterStatus, filterCategory, searchTerm]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: 'AED',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format percentage
  const formatPercentage = (value: number) => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'over_budget':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Over Budget</Badge>;
      case 'under_budget':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Under Budget</Badge>;
      case 'on_budget':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">On Budget</Badge>;
      case 'unplanned':
        return <Badge className="bg-purple-100 text-purple-700 border-purple-200">Unplanned</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">{status}</Badge>;
    }
  };

  // Get category icon
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'existing':
        return <CheckCircleIcon className="w-5 h-5 text-blue-600" />;
      case 'new':
        return <ShoppingCartIcon className="w-5 h-5 text-orange-600" />;
      case 'planned_only':
        return <ClockIcon className="w-5 h-5 text-gray-600" />;
      default:
        return null;
    }
  };

  // Download PDF
  const downloadPDF = () => {
    if (!comparisonData) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Purchase Comparison Report', pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Project: ${comparisonData.project_name}`, 14, 25);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 14, 32);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 14, 42);

    const summaryData = [
      ['Total Planned Amount', formatCurrency(comparisonData.summary.total_planned_amount)],
      ['Total Actual Spent', formatCurrency(comparisonData.summary.total_actual_spent)],
      ['Cost Variance', formatCurrency(comparisonData.summary.total_variance)],
      ['Variance %', formatPercentage(comparisonData.summary.variance_percentage)],
    ];

    autoTable(doc, {
      startY: 45,
      head: [],
      body: summaryData,
      theme: 'plain',
      styles: { fontSize: 9 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { halign: 'right' }
      }
    });

    doc.addPage();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Material Details', 14, 15);

    const tableData = filteredMaterials.map(material => [
      material.material_name,
      material.planned_quantity.toLocaleString(),
      formatCurrency(material.planned_amount),
      material.actual_quantity_purchased.toLocaleString(),
      formatCurrency(material.actual_spent),
      formatCurrency(material.amount_variance),
      material.status.replace('_', ' ')
    ]);

    autoTable(doc, {
      startY: 20,
      head: [['Material', 'Plan Qty', 'Plan Amt', 'Act Qty', 'Act Amt', 'Variance', 'Status']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [67, 97, 238], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 25 },
        3: { halign: 'right', cellWidth: 20 },
        4: { halign: 'right', cellWidth: 25 },
        5: { halign: 'right', cellWidth: 25 },
        6: { cellWidth: 25 }
      }
    });

    doc.save(`Purchase_Comparison_${comparisonData.project_name}_${new Date().toISOString().split('T')[0]}.pdf`);
    showSuccess('PDF report downloaded successfully');
  };

  const getStatusLabel = (boq: any) => {
    const status = boq.status || boq.boq_status || boq.completion_status || '';
    return status
      .replace(/_/g, ' ')
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ') || 'Active';
  };

  const getStatusColor = (boq: any) => {
    const status = (boq.status || boq.boq_status || '').toLowerCase();
    if (status.includes('approved') || status.includes('confirmed') || status === 'completed') {
      return 'bg-green-100 text-green-700 border-green-200';
    } else if (status.includes('pending') || status.includes('sent')) {
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    } else if (status.includes('rejected')) {
      return 'bg-red-100 text-red-700 border-red-200';
    } else {
      return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1920px] mx-auto"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 shadow-md mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedProject && (
                <button
                  onClick={handleBack}
                  className="p-2 hover:bg-green-200 rounded-lg transition-colors mr-2"
                >
                  <ArrowLeftIcon className="w-6 h-6 text-green-700" />
                </button>
              )}
              <ScaleIcon className="w-8 h-8 text-green-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Purchase Comparison Analytics</h1>
                <p className="text-gray-600">
                  {selectedProject
                    ? `Comparing BOQ vs Actual Purchases for ${selectedProject.project_name || 'Project'}`
                    : 'Side-by-side comparison of planned vs actual materials'
                  }
                </p>
              </div>
            </div>

            {selectedProject && comparisonData && (
              <button
                onClick={downloadPDF}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <ArrowDownTrayIcon className="w-5 h-5" />
                Download PDF
              </button>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-xl shadow-md p-12">
            <div className="flex flex-col items-center justify-center">
              <ModernLoadingSpinners size="xl" />
              <p className="mt-4 text-gray-600 font-medium">Loading Projects...</p>
            </div>
          </div>
        )}

        {/* Project Selection */}
        {!loading && !selectedProject && (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="border-b border-gray-200 bg-gray-50 px-6">
                <TabsList className="w-full justify-start bg-transparent h-auto p-0">
                  <TabsTrigger
                    value="live"
                    className="px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:bg-white data-[state=active]:text-green-600 data-[state=active]:shadow-sm transition-all"
                  >
                    <span className="font-semibold">Live Projects</span>
                    <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      {filteredBOQList.length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="completed"
                    className="px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm transition-all"
                  >
                    <span className="font-semibold">Completed</span>
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {boqList.filter((boq: any) => {
                        const projectStatus = (boq.project_status || '').toLowerCase();
                        return projectStatus === 'completed' || projectStatus === 'closed';
                      }).length}
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="live" className="p-6 m-0">
                {filteredBOQList.length === 0 ? (
                  <div className="text-center py-12">
                    <DocumentChartBarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No live projects available</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredBOQList.map((boq: any) => (
                      <motion.div
                        key={boq.boq_id || boq.project_id}
                        whileHover={{ scale: 1.02 }}
                        className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-lg transition-all"
                        onClick={() => handleProjectSelect(boq)}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <DocumentChartBarIcon className="w-8 h-8 text-green-500" />
                          <Badge className={getStatusColor(boq)}>{getStatusLabel(boq)}</Badge>
                        </div>
                        <h3 className="font-semibold text-gray-800 mb-2 line-clamp-2">
                          {boq.project_name || boq.project?.name || 'Unnamed Project'}
                        </h3>
                        <p className="text-sm text-gray-500 mb-3 line-clamp-1">
                          {boq.boq_description || `BOQ for ${boq.project_name || 'project'}`}
                        </p>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>BOQ ID: #{boq.boq_id}</span>
                          <span>{boq.created_at ? new Date(boq.created_at).toLocaleDateString('en-GB') : ''}</span>
                        </div>
                        <button className="w-full mt-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                          <ChartBarIcon className="w-4 h-4" />
                          View Comparison
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="completed" className="p-6 m-0">
                {filteredBOQList.length === 0 ? (
                  <div className="text-center py-12">
                    <DocumentChartBarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No completed projects available</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredBOQList.map((boq: any) => (
                      <motion.div
                        key={boq.boq_id || boq.project_id}
                        whileHover={{ scale: 1.02 }}
                        className="bg-white border border-gray-200 rounded-xl p-5 cursor-pointer hover:shadow-lg transition-all"
                        onClick={() => handleProjectSelect(boq)}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <DocumentChartBarIcon className="w-8 h-8 text-blue-500" />
                          <Badge className={getStatusColor(boq)}>{getStatusLabel(boq)}</Badge>
                        </div>
                        <h3 className="font-semibold text-gray-800 mb-2 line-clamp-2">
                          {boq.project_name || boq.project?.name || 'Unnamed Project'}
                        </h3>
                        <p className="text-sm text-gray-500 mb-3 line-clamp-1">
                          {boq.boq_description || `BOQ for ${boq.project_name || 'project'}`}
                        </p>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>BOQ ID: #{boq.boq_id}</span>
                          <span>{boq.created_at ? new Date(boq.created_at).toLocaleDateString('en-GB') : ''}</span>
                        </div>
                        <button className="w-full mt-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                          <ChartBarIcon className="w-4 h-4" />
                          View Comparison
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Comparison Data View - SPLIT VIEW */}
        {selectedProject && (
          <div className="space-y-6">
            {loadingComparison ? (
              <div className="bg-white rounded-xl shadow-md p-12">
                <div className="flex flex-col items-center justify-center">
                  <ModernLoadingSpinners size="xl" />
                  <p className="mt-4 text-gray-600 font-medium">Analyzing purchase data...</p>
                </div>
              </div>
            ) : comparisonData ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl shadow-md p-5 border-l-4 border-blue-500">
                    <p className="text-sm text-gray-500">Total Planned (BOQ)</p>
                    <p className="text-2xl font-bold text-gray-800">{formatCurrency(comparisonData.summary.total_planned_amount)}</p>
                    <p className="text-xs text-gray-500 mt-1">Original Estimate</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-md p-5 border-l-4 border-green-500">
                    <p className="text-sm text-gray-500">Total Actual Spent</p>
                    <p className="text-2xl font-bold text-gray-800">{formatCurrency(comparisonData.summary.total_actual_spent)}</p>
                    <p className="text-xs text-gray-500 mt-1">Purchased Amount</p>
                  </div>
                  <div className={`bg-white rounded-xl shadow-md p-5 border-l-4 ${comparisonData.summary.total_variance > 0 ? 'border-red-500' : 'border-green-500'}`}>
                    <p className="text-sm text-gray-500">Cost Variance</p>
                    <p className={`text-2xl font-bold ${comparisonData.summary.total_variance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(comparisonData.summary.total_variance)}
                    </p>
                    <p className={`text-xs ${comparisonData.summary.total_variance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {formatPercentage(comparisonData.summary.variance_percentage)}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-md p-5 border-l-4 border-purple-500">
                    <p className="text-sm text-gray-500">Materials Breakdown</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">BOQ: {comparisonData.breakdown.existing_materials}</span>
                      <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">New: {comparisonData.breakdown.new_materials}</span>
                      <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">Modified: {comparisonData.breakdown.modified_materials}</span>
                    </div>
                  </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl shadow-md p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FunnelIcon className="w-5 h-5 text-gray-600" />
                    <h3 className="font-semibold text-gray-800">Filters</h3>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setFilterStatus('all')}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filterStatus === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      All ({comparisonData.materials.length})
                    </button>
                    <button
                      onClick={() => setFilterCategory('existing')}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filterCategory === 'existing' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                    >
                      In BOQ ({comparisonData.breakdown.existing_materials})
                    </button>
                    <button
                      onClick={() => setFilterCategory('new')}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filterCategory === 'new' ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                    >
                      New Purchase ({comparisonData.breakdown.new_materials})
                    </button>
                    <button
                      onClick={() => setFilterStatus('over_budget')}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filterStatus === 'over_budget' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                    >
                      Over Budget ({comparisonData.summary.over_budget_count})
                    </button>
                    <button
                      onClick={() => setFilterStatus('unplanned')}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filterStatus === 'unplanned' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'}`}
                    >
                      Unplanned ({comparisonData.summary.unplanned_count})
                    </button>
                    {(filterStatus !== 'all' || filterCategory !== 'all') && (
                      <button
                        onClick={() => {
                          setFilterStatus('all');
                          setFilterCategory('all');
                        }}
                        className="px-3 py-1.5 rounded-lg text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>

                {/* SPLIT VIEW LAYOUT */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* LEFT: Material List */}
                  <div className="bg-white rounded-xl shadow-md overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
                      <h2 className="text-white font-bold text-lg flex items-center gap-2">
                        <DocumentChartBarIcon className="w-6 h-6" />
                        Materials List ({filteredMaterials.length})
                      </h2>
                    </div>
                    <div className="divide-y divide-gray-200 max-h-[800px] overflow-y-auto">
                      {filteredMaterials.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                          <XCircleIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                          <p>No materials found</p>
                        </div>
                      ) : (
                        filteredMaterials.map((material, index) => (
                          <motion.div
                            key={`${material.material_name}-${index}`}
                            whileHover={{ backgroundColor: '#f9fafb' }}
                            onClick={() => setSelectedMaterial(material)}
                            className={`p-4 cursor-pointer transition-all ${
                              selectedMaterial?.material_name === material.material_name
                                ? 'bg-blue-50 border-l-4 border-blue-600'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-start gap-2">
                                {getCategoryIcon(material.category)}
                                <div className="flex-1">
                                  <h3 className="font-semibold text-gray-900">{material.material_name}</h3>
                                  <p className="text-xs text-gray-500">{material.unit}</p>
                                </div>
                              </div>
                              {getStatusBadge(material.status)}
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                              <div className="bg-blue-50 rounded p-2">
                                <p className="text-xs text-blue-600 font-medium">Planned</p>
                                <p className="font-bold text-blue-900">{formatCurrency(material.planned_amount)}</p>
                                <p className="text-xs text-blue-600">{material.planned_quantity} {material.unit}</p>
                              </div>
                              <div className="bg-green-50 rounded p-2">
                                <p className="text-xs text-green-600 font-medium">Actual</p>
                                <p className="font-bold text-green-900">{formatCurrency(material.actual_spent)}</p>
                                <p className="text-xs text-green-600">{material.actual_quantity_purchased} {material.unit}</p>
                              </div>
                            </div>
                            <div className={`mt-2 text-xs font-medium ${
                              material.amount_variance > 0 ? 'text-red-600' :
                              material.amount_variance < 0 ? 'text-green-600' : 'text-gray-600'
                            }`}>
                              Variance: {formatCurrency(material.amount_variance)} ({formatPercentage(material.amount_variance_percentage)})
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* RIGHT: Detailed Comparison View */}
                  <div className="bg-white rounded-xl shadow-md overflow-hidden">
                    <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4">
                      <h2 className="text-white font-bold text-lg flex items-center gap-2">
                        <ScaleIcon className="w-6 h-6" />
                        Detailed Comparison
                      </h2>
                    </div>
                    <div className="p-6 max-h-[800px] overflow-y-auto">
                      {selectedMaterial ? (
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={selectedMaterial.material_name}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                          >
                            {/* Material Header */}
                            <div className="border-b pb-4">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <h3 className="text-2xl font-bold text-gray-900">{selectedMaterial.material_name}</h3>
                                  <p className="text-gray-500 mt-1">Unit: {selectedMaterial.unit}</p>
                                  {selectedMaterial.item_name && (
                                    <p className="text-sm text-gray-600 mt-1">Item: {selectedMaterial.item_name}</p>
                                  )}
                                </div>
                                {getStatusBadge(selectedMaterial.status)}
                              </div>
                            </div>

                            {/* Planned vs Actual Sections */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* BOQ Planned Section */}
                              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border-2 border-blue-200">
                                <div className="flex items-center gap-2 mb-4">
                                  <DocumentChartBarIcon className="w-6 h-6 text-blue-600" />
                                  <h4 className="font-bold text-blue-900">BOQ Planned</h4>
                                </div>
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-sm text-blue-600 font-medium">Quantity</p>
                                    <p className="text-3xl font-bold text-blue-900">{selectedMaterial.planned_quantity}</p>
                                    <p className="text-sm text-blue-600">{selectedMaterial.unit}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-blue-600 font-medium">Rate</p>
                                    <p className="text-xl font-bold text-blue-900">{formatCurrency(selectedMaterial.planned_rate)}</p>
                                    <p className="text-sm text-blue-600">per {selectedMaterial.unit}</p>
                                  </div>
                                  <div className="border-t-2 border-blue-300 pt-3 mt-3">
                                    <p className="text-sm text-blue-600 font-medium">Total Amount</p>
                                    <p className="text-3xl font-bold text-blue-900">{formatCurrency(selectedMaterial.planned_amount)}</p>
                                  </div>
                                </div>
                              </div>

                              {/* Actual Purchase Section */}
                              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border-2 border-green-200">
                                <div className="flex items-center gap-2 mb-4">
                                  <ShoppingCartIcon className="w-6 h-6 text-green-600" />
                                  <h4 className="font-bold text-green-900">Actual Purchased</h4>
                                </div>
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-sm text-green-600 font-medium">Quantity</p>
                                    <p className="text-3xl font-bold text-green-900">{selectedMaterial.actual_quantity_purchased}</p>
                                    <p className="text-sm text-green-600">{selectedMaterial.unit}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-green-600 font-medium">Rate</p>
                                    <p className="text-xl font-bold text-green-900">{formatCurrency(selectedMaterial.actual_rate)}</p>
                                    <p className="text-sm text-green-600">per {selectedMaterial.unit}</p>
                                  </div>
                                  <div className="border-t-2 border-green-300 pt-3 mt-3">
                                    <p className="text-sm text-green-600 font-medium">Total Spent</p>
                                    <p className="text-3xl font-bold text-green-900">{formatCurrency(selectedMaterial.actual_spent)}</p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Variance Analysis */}
                            <div className={`rounded-xl p-6 border-2 ${
                              selectedMaterial.amount_variance > 0 ? 'bg-red-50 border-red-200' :
                              selectedMaterial.amount_variance < 0 ? 'bg-green-50 border-green-200' :
                              'bg-gray-50 border-gray-200'
                            }`}>
                              <div className="flex items-center gap-2 mb-4">
                                <CurrencyDollarIcon className={`w-6 h-6 ${
                                  selectedMaterial.amount_variance > 0 ? 'text-red-600' :
                                  selectedMaterial.amount_variance < 0 ? 'text-green-600' : 'text-gray-600'
                                }`} />
                                <h4 className={`font-bold ${
                                  selectedMaterial.amount_variance > 0 ? 'text-red-900' :
                                  selectedMaterial.amount_variance < 0 ? 'text-green-900' : 'text-gray-900'
                                }`}>Variance Analysis</h4>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className={`text-sm font-medium ${
                                    selectedMaterial.amount_variance > 0 ? 'text-red-600' :
                                    selectedMaterial.amount_variance < 0 ? 'text-green-600' : 'text-gray-600'
                                  }`}>Quantity Variance</p>
                                  <p className={`text-2xl font-bold ${
                                    selectedMaterial.quantity_variance > 0 ? 'text-red-900' :
                                    selectedMaterial.quantity_variance < 0 ? 'text-green-900' : 'text-gray-900'
                                  }`}>
                                    {selectedMaterial.quantity_variance > 0 ? '+' : ''}{selectedMaterial.quantity_variance} {selectedMaterial.unit}
                                  </p>
                                  <p className="text-sm text-gray-600">{formatPercentage(selectedMaterial.quantity_variance_percentage)}</p>
                                </div>
                                <div>
                                  <p className={`text-sm font-medium ${
                                    selectedMaterial.amount_variance > 0 ? 'text-red-600' :
                                    selectedMaterial.amount_variance < 0 ? 'text-green-600' : 'text-gray-600'
                                  }`}>Cost Variance</p>
                                  <p className={`text-2xl font-bold ${
                                    selectedMaterial.amount_variance > 0 ? 'text-red-900' :
                                    selectedMaterial.amount_variance < 0 ? 'text-green-900' : 'text-gray-900'
                                  }`}>{formatCurrency(selectedMaterial.amount_variance)}</p>
                                  <p className="text-sm text-gray-600">{formatPercentage(selectedMaterial.amount_variance_percentage)}</p>
                                </div>
                              </div>
                            </div>

                            {/* Purchase Details */}
                            {selectedMaterial.purchase_count > 0 && (
                              <div className="bg-gray-50 rounded-xl p-6">
                                <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                  <ShoppingCartIcon className="w-5 h-5 text-gray-600" />
                                  Purchase History ({selectedMaterial.purchase_count} Purchase{selectedMaterial.purchase_count > 1 ? 's' : ''})
                                </h4>
                                <div className="space-y-3">
                                  {selectedMaterial.purchase_details.map((purchase, idx) => {
                                    const totalWithVat = purchase.total_price + (purchase.vat_amount || 0);
                                    return (
                                      <div key={idx} className="bg-white rounded-lg p-4 border border-gray-200">
                                        <div className="flex items-start justify-between mb-2">
                                          <div>
                                            <p className="font-semibold text-gray-900">{purchase.vendor_name}</p>
                                            <p className="text-sm text-gray-500">
                                              {purchase.cr_id ? `CR-${purchase.cr_id}` : `PO-${purchase.po_child_id}`}
                                            </p>
                                          </div>
                                          <Badge className="bg-blue-100 text-blue-700 text-xs">
                                            {purchase.purchase_date ? new Date(purchase.purchase_date).toLocaleDateString('en-GB') : 'Pending'}
                                          </Badge>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 mt-3">
                                          <div>
                                            <p className="text-xs text-gray-500">Quantity</p>
                                            <p className="font-semibold text-gray-900">{purchase.quantity} {selectedMaterial.unit}</p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-500">Unit Price</p>
                                            <p className="font-semibold text-gray-900">{formatCurrency(purchase.unit_price)}</p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-500">Subtotal</p>
                                            <p className="font-semibold text-gray-900">{formatCurrency(purchase.total_price)}</p>
                                          </div>
                                          {purchase.vat_amount && purchase.vat_amount > 0 && (
                                            <>
                                              <div>
                                                <p className="text-xs text-gray-500">VAT ({purchase.vat_percent || 5}%)</p>
                                                <p className="font-semibold text-gray-900">{formatCurrency(purchase.vat_amount)}</p>
                                              </div>
                                              <div className="col-span-2 border-t pt-2">
                                                <p className="text-xs text-gray-500">Total (incl. VAT)</p>
                                                <p className="font-bold text-lg text-gray-900">{formatCurrency(totalWithVat)}</p>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {selectedMaterial.purchase_count === 0 && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
                                <ClockIcon className="w-12 h-12 text-yellow-600 mx-auto mb-3" />
                                <p className="font-semibold text-yellow-900">Not Purchased Yet</p>
                                <p className="text-sm text-yellow-700 mt-2">
                                  This material is planned in BOQ but hasn't been purchased yet
                                </p>
                              </div>
                            )}
                          </motion.div>
                        </AnimatePresence>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-96 text-gray-400">
                          <ScaleIcon className="w-20 h-20 mb-4" />
                          <p className="text-lg font-medium">Select a material to view details</p>
                          <p className="text-sm mt-2">Click on any material from the list on the left</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl shadow-md p-12 text-center">
                <DocumentChartBarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No comparison data available for this project</p>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
