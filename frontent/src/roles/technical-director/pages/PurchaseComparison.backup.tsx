import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { DocumentChartBarIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { showSuccess, showError, showInfo } from '@/utils/toastHelper';
import { boqTrackingService } from '@/roles/project-manager/services/boqTrackingService';
import { useProjectsAutoSync } from '@/hooks/useAutoSync';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/api/config';

interface MaterialComparison {
  item_name: string;
  sub_item_name: string;
  material_name: string;
  master_material_id: number | null;
  unit: string;
  planned_quantity: number;
  planned_rate: number;
  planned_amount: number;
  actual_quantity_purchased: number;
  actual_quantity_used: number;
  remaining_quantity: number;
  actual_spent: number;
  quantity_variance: number;
  amount_variance: number;
  quantity_variance_percentage: number;
  amount_variance_percentage: number;
  status: 'over_budget' | 'under_budget' | 'on_budget' | 'unplanned';
  is_from_change_request: boolean;
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
}

export default function PurchaseComparison() {
  const [searchParams] = useSearchParams();
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('live');
  const [comparisonData, setComparisonData] = useState<PurchaseComparisonData | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Real-time auto-sync for BOQ list
  const { data: boqData, isLoading: loading, refetch } = useProjectsAutoSync(
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

      // Filter for all BOQs except rejected ones
      const filteredBOQs = allBOQs.filter((boq: any) => {
        const status = (boq.status || boq.boq_status || boq.completion_status || '').toLowerCase();
        return status !== 'rejected';
      });

      if (filteredBOQs.length === 0) {
        showInfo('No BOQs found');
      }

      return filteredBOQs;
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

  // Fetch purchase comparison data when project is selected
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

  // Auto-select project from URL param
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
    await fetchComparisonData(project.project_id);
  };

  const handleBack = () => {
    setSelectedProject(null);
    setComparisonData(null);
    setFilterStatus('all');
  };

  // Get status badge styling
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

  // Filter materials based on status filter
  const filteredMaterials = useMemo(() => {
    if (!comparisonData) return [];
    if (filterStatus === 'all') return comparisonData.materials;
    return comparisonData.materials.filter(m => m.status === filterStatus);
  }, [comparisonData, filterStatus]);

  // Get clean status label
  const getStatusLabel = (boq: any) => {
    const status = boq.status || boq.boq_status || boq.completion_status || '';
    return status
      .replace(/_/g, ' ')
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ') || 'Active';
  };

  // Get status color
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
        className="max-w-[1800px] mx-auto"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 shadow-md mb-6">
          <div className="flex items-center gap-3">
            {selectedProject && (
              <button
                onClick={handleBack}
                className="p-2 hover:bg-green-200 rounded-lg transition-colors mr-2"
              >
                <ArrowLeftIcon className="w-6 h-6 text-green-700" />
              </button>
            )}
            <DocumentChartBarIcon className="w-8 h-8 text-green-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Purchase Comparison</h1>
              <p className="text-gray-600">
                {selectedProject
                  ? `Comparing estimated vs actual purchases for ${selectedProject.project_name || selectedProject.project?.name || 'Project'}`
                  : 'Compare planned BOQ materials with actual purchases'
                }
              </p>
            </div>
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
              {/* Tab Headers */}
              <div className="border-b border-gray-200 bg-gray-50 px-6">
                <TabsList className="w-full justify-start bg-transparent h-auto p-0">
                  <TabsTrigger
                    value="live"
                    className="px-6 py-4 rounded-none border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:bg-white data-[state=active]:text-green-600 data-[state=active]:shadow-sm transition-all"
                  >
                    <span className="font-semibold">Live Projects</span>
                    <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      {boqList.filter((boq: any) => {
                        const projectStatus = (boq.project_status || '').toLowerCase();
                        return projectStatus !== 'completed' && projectStatus !== 'closed';
                      }).length}
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

              {/* Tab Content */}
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
                          <span>{boq.created_at ? new Date(boq.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                        </div>
                        <button className="w-full mt-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                          <DocumentChartBarIcon className="w-4 h-4" />
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
                          <span>{boq.created_at ? new Date(boq.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                        </div>
                        <button className="w-full mt-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                          <DocumentChartBarIcon className="w-4 h-4" />
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

        {/* Comparison Data View */}
        {selectedProject && (
          <div className="space-y-6">
            {loadingComparison ? (
              <div className="bg-white rounded-xl shadow-md p-12">
                <div className="flex flex-col items-center justify-center">
                  <ModernLoadingSpinners size="xl" />
                  <p className="mt-4 text-gray-600 font-medium">Loading comparison data...</p>
                </div>
              </div>
            ) : comparisonData ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="bg-white rounded-xl shadow-md p-5 border-l-4 border-blue-500">
                    <p className="text-sm text-gray-500">Total Planned</p>
                    <p className="text-2xl font-bold text-gray-800">{formatCurrency(comparisonData.summary.total_planned_amount)}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-md p-5 border-l-4 border-green-500">
                    <p className="text-sm text-gray-500">Total Actual Spent</p>
                    <p className="text-2xl font-bold text-gray-800">{formatCurrency(comparisonData.summary.total_actual_spent)}</p>
                  </div>
                  <div className={`bg-white rounded-xl shadow-md p-5 border-l-4 ${comparisonData.summary.total_variance > 0 ? 'border-red-500' : 'border-green-500'}`}>
                    <p className="text-sm text-gray-500">Variance</p>
                    <p className={`text-2xl font-bold ${comparisonData.summary.total_variance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(comparisonData.summary.total_variance)}
                    </p>
                    <p className={`text-sm ${comparisonData.summary.total_variance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {formatPercentage(comparisonData.summary.variance_percentage)}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-md p-5 border-l-4 border-purple-500">
                    <p className="text-sm text-gray-500">Total Materials</p>
                    <p className="text-2xl font-bold text-gray-800">{comparisonData.summary.total_materials}</p>
                  </div>
                  <div className="bg-white rounded-xl shadow-md p-5 border-l-4 border-orange-500">
                    <p className="text-sm text-gray-500">Status Breakdown</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Over: {comparisonData.summary.over_budget_count}</span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Under: {comparisonData.summary.under_budget_count}</span>
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">New: {comparisonData.summary.unplanned_count}</span>
                    </div>
                  </div>
                </div>

                {/* Filter Buttons */}
                <div className="bg-white rounded-xl shadow-md p-4 flex gap-2 flex-wrap">
                  <button
                    onClick={() => setFilterStatus('all')}
                    className={`px-4 py-2 rounded-lg transition-colors ${filterStatus === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    All ({comparisonData.materials.length})
                  </button>
                  <button
                    onClick={() => setFilterStatus('over_budget')}
                    className={`px-4 py-2 rounded-lg transition-colors ${filterStatus === 'over_budget' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                  >
                    Over Budget ({comparisonData.summary.over_budget_count})
                  </button>
                  <button
                    onClick={() => setFilterStatus('under_budget')}
                    className={`px-4 py-2 rounded-lg transition-colors ${filterStatus === 'under_budget' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                  >
                    Under Budget ({comparisonData.summary.under_budget_count})
                  </button>
                  <button
                    onClick={() => setFilterStatus('on_budget')}
                    className={`px-4 py-2 rounded-lg transition-colors ${filterStatus === 'on_budget' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                  >
                    On Budget ({comparisonData.summary.on_budget_count})
                  </button>
                  <button
                    onClick={() => setFilterStatus('unplanned')}
                    className={`px-4 py-2 rounded-lg transition-colors ${filterStatus === 'unplanned' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'}`}
                  >
                    Unplanned ({comparisonData.summary.unplanned_count})
                  </button>
                </div>

                {/* Materials Table */}
                <div className="bg-white rounded-xl shadow-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item / Sub-Item</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Planned Qty</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actual Qty</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Planned Amount</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actual Spent</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Variance</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredMaterials.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                              No materials found for the selected filter
                            </td>
                          </tr>
                        ) : (
                          filteredMaterials.map((material, index) => (
                            <tr key={`${material.master_material_id}-${index}`} className="hover:bg-gray-50">
                              <td className="px-4 py-4">
                                <div className="flex items-center">
                                  <div>
                                    <p className="font-medium text-gray-900">{material.material_name}</p>
                                    <p className="text-xs text-gray-500">{material.unit}</p>
                                  </div>
                                  {material.is_from_change_request && (
                                    <Badge className="ml-2 bg-purple-100 text-purple-700 text-xs">CR</Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <p className="text-sm text-gray-900">{material.item_name || '-'}</p>
                                <p className="text-xs text-gray-500">{material.sub_item_name || '-'}</p>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <p className="text-sm text-gray-900">{material.planned_quantity.toLocaleString()}</p>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <p className="text-sm text-gray-900">{material.actual_quantity_purchased.toLocaleString()}</p>
                                <p className="text-xs text-gray-500">Used: {material.actual_quantity_used.toLocaleString()}</p>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <p className="text-sm text-gray-900">{formatCurrency(material.planned_amount)}</p>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <p className="text-sm text-gray-900">{formatCurrency(material.actual_spent)}</p>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <p className={`text-sm font-medium ${material.amount_variance > 0 ? 'text-red-600' : material.amount_variance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                  {formatCurrency(material.amount_variance)}
                                </p>
                                <p className={`text-xs ${material.amount_variance > 0 ? 'text-red-500' : material.amount_variance < 0 ? 'text-green-500' : 'text-gray-500'}`}>
                                  {formatPercentage(material.amount_variance_percentage)}
                                </p>
                              </td>
                              <td className="px-4 py-4 text-center">
                                {getStatusBadge(material.status)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
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
