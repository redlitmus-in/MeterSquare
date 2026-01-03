import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { DocumentChartBarIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { showError, showInfo } from '@/utils/toastHelper';
import { useProjectsAutoSync } from '@/hooks/useAutoSync';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/api/config';

// Interface matching backend response structure
interface ComparisonMaterial {
  material_name: string;
  master_material_id: number | null;
  item_name: string;
  sub_item_name: string;
  unit: string;
  planned: {
    quantity: number;
    rate: number;
    amount: number;
  };
  actual: {
    quantity_purchased: number;
    quantity_used: number;
    remaining_quantity: number;
    unit_price: number;
    amount: number;
  };
  variance: {
    quantity: number;
    rate: number;
    amount: number;
    quantity_percentage: number;
    rate_percentage: number;
    amount_percentage: number;
  };
  status: 'over_budget' | 'under_budget' | 'on_budget' | 'not_purchased';
  // New material from change request
  is_new_material?: boolean;
  change_request_id?: number;
  justification?: string;
}

interface UnplannedMaterial {
  material_name: string;
  master_material_id: number | null;
  item_name: string;
  unit: string;
  quantity_purchased: number;
  quantity_used: number;
  remaining_quantity: number;
  unit_price: number;
  total_amount: number;
  is_from_change_request: boolean;
  status: 'unplanned';
}

interface PurchaseComparisonData {
  project_id: number;
  project_name: string;
  boq_id: number;
  planned_materials: {
    materials: any[];
    summary: {
      total_count: number;
      total_quantity: number;
      total_amount: number;
    };
  };
  actual_materials: {
    materials: any[];
    summary: {
      total_count: number;
      total_quantity_purchased: number;
      total_amount: number;
    };
  };
  comparison: {
    materials: ComparisonMaterial[];
    summary: {
      total_compared: number;
      over_budget_count: number;
      under_budget_count: number;
      on_budget_count: number;
      not_purchased_count: number;
    };
  };
  unplanned_materials: {
    materials: UnplannedMaterial[];
    summary: {
      total_count: number;
      total_amount: number;
    };
  };
  overall_summary: {
    planned_total_amount: number;
    actual_total_amount: number;
    unplanned_total_amount: number;
    total_variance: number;
    variance_percentage: number;
    budget_status: string;
  };
}

export default function PurchaseComparison() {
  const [searchParams] = useSearchParams();
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('live');
  const [comparisonData, setComparisonData] = useState<PurchaseComparisonData | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  // Real-time auto-sync for BOQ list - use dedicated purchase comparison projects endpoint
  const { data: boqData, isLoading: loading, refetch } = useProjectsAutoSync(
    async () => {
      const token = localStorage.getItem('access_token');
      const response = await apiClient.get('/purchase_comparison_projects', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      let allBOQs: any[] = [];

      if (response.data.success) {
        const data = response.data.data;
        if (Array.isArray(data)) {
          allBOQs = data;
        } else if (data.projects && Array.isArray(data.projects)) {
          allBOQs = data.projects;
        } else if (data.boqs && Array.isArray(data.boqs)) {
          allBOQs = data.boqs;
        }
      }

      if (allBOQs.length === 0) {
        showInfo('No projects with purchase data found');
      }

      return allBOQs;
    }
  );

  const boqList = useMemo(() => boqData || [], [boqData]);

  // Filter BOQs based on active tab
  const filteredBOQList = useMemo(() => {
    if (activeTab === 'live') {
      return boqList.filter((boq: any) => {
        // Check multiple status fields for completed/closed status
        const projectStatus = (boq.project_status || '').toLowerCase();
        const boqStatus = (boq.status || boq.boq_status || '').toLowerCase();
        const isCompleted = projectStatus === 'completed' || projectStatus === 'closed' ||
                          boqStatus === 'completed' || boqStatus === 'closed';
        return !isCompleted;
      });
    } else {
      return boqList.filter((boq: any) => {
        // Check multiple status fields for completed/closed status
        const projectStatus = (boq.project_status || '').toLowerCase();
        const boqStatus = (boq.status || boq.boq_status || '').toLowerCase();
        return projectStatus === 'completed' || projectStatus === 'closed' ||
               boqStatus === 'completed' || boqStatus === 'closed';
      });
    }
  }, [boqList, activeTab]);

  // Fetch purchase comparison data when project is selected
  const fetchComparisonData = async (projectId: number) => {
    setLoadingComparison(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await apiClient.get(`/purchase_comparison/${projectId}`, {
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
      case 'not_purchased':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Not Purchased</Badge>;
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

  // Group materials by item_name for item-based view
  // Uses the new API structure: comparison.items[].materials with actual.purchases[]
  const groupedByItem = useMemo(() => {
    // New API structure: comparison.items[] contains item_name and materials[]
    const comparisonItems = comparisonData?.comparison?.items || [];
    // Also get unplanned materials (new materials from change requests)
    // Structure: unplanned_materials.items[].materials[]
    const unplannedItems = comparisonData?.unplanned_materials?.items || [];

    const grouped: { [key: string]: {
      item_name: string;
      plannedMaterials: any[];
      actualMaterials: any[];
      totals: {
        planned_amount: number;
        actual_amount: number;
        variance: number;
      };
    }} = {};

    // Process each item from comparison
    comparisonItems.forEach((item: any) => {
      const itemName = item.item_name || 'Uncategorized';

      if (!grouped[itemName]) {
        grouped[itemName] = {
          item_name: itemName,
          plannedMaterials: [],
          actualMaterials: [],
          totals: {
            planned_amount: item.summary?.planned_amount || 0,
            actual_amount: item.summary?.actual_amount || 0,
            variance: item.summary?.variance || 0
          }
        };
      }

      // Process materials within each item
      (item.materials || []).forEach((material: any) => {
        // Add to planned materials
        grouped[itemName].plannedMaterials.push(material);

        // Get CR info from purchases if available
        // New API structure: purchases is directly on material, not under material.actual
        const purchases = material.purchases || [];
        const firstPurchase = purchases[0];
        const crId = firstPurchase?.cr_id || null;
        // Check if ANY purchase has is_new_material: true
        const isNewMaterial = purchases.some((p: any) => p.is_new_material === true);

        // Add to actual materials with CR info (preserve purchases array for filtering)
        // New API structure: actual_amount is directly on material, not under material.actual.amount
        grouped[itemName].actualMaterials.push({
          ...material,
          actual_amount: material.actual_amount || 0,
          is_new_material: isNewMaterial,
          is_from_change_request: purchases.length > 0,
          change_request_id: crId,
          justification: null, // Justification not in this API response
          purchases: purchases // Keep purchases array for status filtering
        });
      });
    });

    // Process unplanned materials (new materials from change requests)
    // Structure: unplanned_materials.items[].materials[]
    unplannedItems.forEach((item: any) => {
      const itemName = item.item_name || 'Uncategorized';

      if (!grouped[itemName]) {
        grouped[itemName] = {
          item_name: itemName,
          plannedMaterials: [],
          actualMaterials: [],
          totals: {
            planned_amount: 0,
            actual_amount: 0,
            variance: 0
          }
        };
      }

      // Process each material in this unplanned item
      (item.materials || []).forEach((material: any) => {
        // Add unplanned material to actual materials only (not planned)
        // All unplanned materials are considered NEW materials
        const materialAmount = material.actual_amount || material.amount || material.total_amount || 0;
        grouped[itemName].actualMaterials.push({
          material_name: material.material_name,
          sub_item_name: material.sub_item_name || material.item_name || itemName,
          item_name: material.item_name || itemName,
          actual_amount: materialAmount,
          is_new_material: true, // All unplanned materials are NEW
          is_from_change_request: true, // All unplanned materials are from change requests
          change_request_id: material.change_request_id || null,
          justification: null,
          purchases: [{
            cr_status: material.cr_status || 'purchase_completed',
            is_new_material: true
          }]
        });

        // Update totals for the group
        grouped[itemName].totals.actual_amount += materialAmount;
      });
    });

    return Object.values(grouped);
  }, [comparisonData]);


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
                        const boqStatus = (boq.status || boq.boq_status || '').toLowerCase();
                        const isCompleted = projectStatus === 'completed' || projectStatus === 'closed' ||
                                          boqStatus === 'completed' || boqStatus === 'closed';
                        return !isCompleted;
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
                        const boqStatus = (boq.status || boq.boq_status || '').toLowerCase();
                        return projectStatus === 'completed' || projectStatus === 'closed' ||
                               boqStatus === 'completed' || boqStatus === 'closed';
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
            ) : comparisonData && comparisonData.overall_summary ? (
              <>
                {/* Comparison - Item Based Side-by-Side View */}
                {(
                  <div className="space-y-6">
                    {groupedByItem.length === 0 ? (
                      <div className="bg-white rounded-xl shadow-md p-12 text-center">
                        <DocumentChartBarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">No materials found</p>
                      </div>
                    ) : (
                      groupedByItem.map((group) => (
                        <div key={group.item_name} className="bg-white rounded-xl shadow-md overflow-hidden border-l-4 border-indigo-500">
                          {/* Item Header */}
                          <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200">
                            <h3 className="font-bold text-gray-800 uppercase tracking-wide">{group.item_name}</h3>
                          </div>

                          {/* Side-by-Side Comparison */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
                            {/* Left Side - Planned Budget */}
                            <div className="p-5">
                              <div className="mb-4">
                                <h4 className="text-lg font-semibold text-gray-800">Planned Budget</h4>
                                <p className="text-sm text-gray-500">Original estimate</p>
                              </div>

                              <div className="mb-3">
                                <p className="text-sm font-medium text-gray-600 mb-2">Sub Items</p>
                              </div>

                              {/* Planned Materials List */}
                              <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="bg-gray-50 px-4 py-2 flex justify-between text-xs font-medium text-gray-500 uppercase">
                                  <span>Material</span>
                                  <span>Amount</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {group.plannedMaterials.map((material, index) => (
                                    <div key={`planned-${material.master_material_id}-${index}`} className="px-4 py-3 flex justify-between items-start">
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">{material.material_name}</p>
                                        <p className="text-xs text-gray-500">[{material.sub_item_name || material.item_name}]</p>
                                      </div>
                                      <p className="text-sm font-medium text-gray-900">
                                        {(material.planned_amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                            </div>

                            {/* Right Side - Actual Spending */}
                            <div className="p-5">
                              <div className="mb-4">
                                <h4 className="text-lg font-semibold text-gray-800">Actual Spending</h4>
                                <p className="text-sm text-gray-500">Real costs incurred</p>
                              </div>

                              <div className="mb-3">
                                <p className="text-sm font-medium text-gray-600 mb-2">Sub Items</p>
                              </div>

                              {/* Actual Materials List */}
                              <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="bg-gray-50 px-4 py-2 grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 uppercase">
                                  <span className="col-span-5">Material</span>
                                  <span className="col-span-2 text-right">Amount</span>
                                  <span className="col-span-5">Reason</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {group.actualMaterials.filter((m: any) => {
                                    const amount = m.actual_amount || 0;
                                    const purchases = m.purchases || [];
                                    const hasActivePurchase = purchases.some((p: any) =>
                                      ['vendor_approved', 'purchase_completed', 'pending_td_approval'].includes(p.cr_status)
                                    );
                                    return amount > 0 || hasActivePurchase || m.is_new_material === true;
                                  }).length === 0 ? (
                                    <div className="px-4 py-6 text-center text-gray-400 text-sm">
                                      No purchases yet
                                    </div>
                                  ) : (
                                    group.actualMaterials
                                      .filter((material: any) => {
                                        const amount = material.actual_amount || 0;
                                        const purchases = material.purchases || [];
                                        const hasActivePurchase = purchases.some((p: any) =>
                                          ['vendor_approved', 'purchase_completed', 'pending_td_approval'].includes(p.cr_status)
                                        );
                                        return amount > 0 || hasActivePurchase || material.is_new_material === true;
                                      })
                                      .map((material: any, index: number) => (
                                        <div key={`actual-${material.master_material_id}-${index}`} className="px-4 py-3 grid grid-cols-12 gap-2 items-start">
                                          <div className="col-span-5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <p className="text-sm font-medium text-gray-900">{material.material_name}</p>
                                              {material.is_new_material === true && (
                                                <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                                                  NEW{material.change_request_id ? ` - CR #${material.change_request_id}` : ''}
                                                </Badge>
                                              )}
                                              {material.is_from_change_request === true && material.is_new_material !== true && material.change_request_id && (
                                                <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">
                                                  CR #{material.change_request_id}
                                                </Badge>
                                              )}
                                            </div>
                                            <p className="text-xs text-gray-500">[{material.sub_item_name || material.item_name}]</p>
                                          </div>
                                          <div className="col-span-2 text-right">
                                            <p className="text-sm font-medium text-gray-900">
                                              {(material.actual_amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                          </div>
                                          <div className="col-span-5">
                                            <p className="text-sm text-blue-600 italic">
                                              {material.justification || '-'}
                                            </p>
                                          </div>
                                        </div>
                                      ))
                                  )}
                                </div>
                              </div>

                            </div>
                          </div>

                          {/* Item Summary - Three columns */}
                          <div className="p-4 bg-gray-100 border-t border-gray-200">
                            <div className="grid grid-cols-3 gap-4">
                              <div className="p-3 rounded-lg bg-blue-50">
                                <p className="text-xs text-gray-500 mb-1">Total Planned</p>
                                <p className="text-base font-bold text-blue-600">
                                  {group.totals.planned_amount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                              </div>
                              <div className="p-3 rounded-lg bg-green-50">
                                <p className="text-xs text-gray-500 mb-1">Total Actual</p>
                                <p className="text-base font-bold text-green-600">
                                  {group.totals.actual_amount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                              </div>
                              <div className={`p-3 rounded-lg ${(group.totals.planned_amount - group.totals.actual_amount) >= 0 ? 'bg-gray-50' : 'bg-red-50'}`}>
                                <p className="text-xs text-gray-500 mb-1">Balance</p>
                                <p className={`text-base font-bold ${(group.totals.planned_amount - group.totals.actual_amount) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                                  {(group.totals.planned_amount - group.totals.actual_amount).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Overall Summary - At Bottom */}
                <div className="bg-white rounded-xl shadow-md overflow-hidden mt-6">
                  <div className="p-4 bg-gray-50 border-b border-gray-200">
                    <h3 className="font-bold text-gray-800">Overall Summary</h3>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-3 rounded-lg bg-blue-50">
                        <p className="text-xs text-gray-500 mb-1">Total Planned</p>
                        <p className="text-lg font-bold text-blue-600">
                          {(comparisonData.overall_summary.planned_total_amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-green-50">
                        <p className="text-xs text-gray-500 mb-1">Total Actual</p>
                        <p className="text-lg font-bold text-green-600">
                          {(comparisonData.overall_summary.actual_total_amount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className={`p-3 rounded-lg ${((comparisonData.overall_summary.planned_total_amount || 0) - (comparisonData.overall_summary.actual_total_amount || 0)) >= 0 ? 'bg-gray-50' : 'bg-red-50'}`}>
                        <p className="text-xs text-gray-500 mb-1">Balance</p>
                        <p className={`text-lg font-bold ${((comparisonData.overall_summary.planned_total_amount || 0) - (comparisonData.overall_summary.actual_total_amount || 0)) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                          {((comparisonData.overall_summary.planned_total_amount || 0) - (comparisonData.overall_summary.actual_total_amount || 0)).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
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
