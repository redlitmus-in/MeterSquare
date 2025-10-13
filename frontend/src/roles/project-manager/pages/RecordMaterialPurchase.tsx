import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCartIcon, CheckCircleIcon, XCircleIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { boqTrackingService } from '../services/boqTrackingService';

export default function RecordMaterialPurchase() {
  const [boqList, setBOQList] = useState<any[]>([]);
  const [selectedBOQ, setSelectedBOQ] = useState<any | null>(null);
  const [plannedBoqData, setPlannedBoqData] = useState<any | null>(null);
  const [comparisonData, setComparisonData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedItemDetail, setSelectedItemDetail] = useState<any | null>(null);

  useEffect(() => {
    fetchBOQs();
  }, []);

  const fetchBOQs = async () => {
    try {
      const response = await boqTrackingService.getAllBOQs();
      console.log('===== BOQ API Response =====', response);

      // Handle different response structures
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

      console.log('All BOQs extracted:', allBOQs);

      // Filter for completed BOQs with more flexible status checking
      const completedBOQs = allBOQs.filter((boq: any) => {
        const status = (boq.status || boq.boq_status || boq.completion_status || '').toLowerCase();
        const isCompleted = status === 'completed' || status === 'complete';
        console.log(`BOQ ${boq.boq_id || boq.id}: status="${status}", isCompleted=${isCompleted}`);
        return isCompleted;
      });

      console.log('Completed BOQs:', completedBOQs);
      setBOQList(completedBOQs);

      if (completedBOQs.length === 0) {
        toast.info('No completed BOQs found');
      }
    } catch (error) {
      console.error('Error fetching BOQs:', error);
      toast.error('Failed to load BOQs');
    }
  };

  const handleBOQChange = async (boqId: number) => {
    const boq = boqList.find(b => b.boq_id === boqId);
    setSelectedBOQ(boq || null);
    setPlannedBoqData(null);
    setComparisonData(null);

    if (boq) {
      setLoading(true);
      await Promise.all([
        fetchPlannedBOQ(boqId),
        fetchComparison(boqId)
      ]);
      setLoading(false);
    }
  };

  const fetchPlannedBOQ = async (boqId: number) => {
    try {
      const response = await boqTrackingService.getBOQDetails(boqId);
      console.log('===== Planned BOQ RAW Response =====', response);

      // Parse the response - the actual structure has existing_purchase.items
      let items: any[] = [];
      let summary: any = null;

      // Case 1: Response has existing_purchase.items (CORRECT STRUCTURE)
      if (response.existing_purchase?.items) {
        items = response.existing_purchase.items;
        summary = response.existing_purchase.summary || response.combined_summary;
        console.log('✓ Found items in existing_purchase:', items.length);
      }
      // Case 2: Response has items array directly
      else if (Array.isArray(response.items)) {
        items = response.items;
        summary = response.summary;
        console.log('✓ Found items array directly');
      }
      // Case 3: Response has boq_details with items
      else if (response.boq_details) {
        if (typeof response.boq_details === 'string') {
          try {
            const parsed = JSON.parse(response.boq_details);
            items = parsed.items || [];
            summary = parsed.summary;
            console.log('✓ Parsed boq_details from string');
          } catch (e) {
            console.error('Failed to parse boq_details string');
          }
        } else if (typeof response.boq_details === 'object') {
          items = response.boq_details.items || [];
          summary = response.boq_details.summary;
          console.log('✓ Got boq_details as object');
        }
      }

      // Use combined_summary as fallback
      if (!summary && response.combined_summary) {
        summary = response.combined_summary;
      }

      const transformedData = {
        boq_id: response.boq_id || boqId,
        boq_name: response.boq_name || 'BOQ',
        items: items,
        summary: summary
      };

      console.log('===== Final Transformed Data =====');
      console.log('Items count:', items.length);
      console.log('First item:', items[0]);
      console.log('Summary:', summary);

      setPlannedBoqData(transformedData);

      if (items.length === 0) {
        toast.warning('No items found in BOQ');
      } else {
        toast.success(`Loaded ${items.length} item(s) from BOQ`);
      }
    } catch (error: any) {
      console.error('Error fetching planned BOQ:', error);
      toast.error('Failed to load planned BOQ');
    }
  };

  const fetchComparison = async (boqId: number) => {
    try {
      const data = await boqTrackingService.getPlannedVsActual(boqId);
      setComparisonData(data);
    } catch (error: any) {
      console.error('Error fetching comparison:', error);
      toast.error('Failed to load comparison');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[1800px] mx-auto"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 shadow-md mb-6">
          <div className="flex items-center gap-3">
            <ShoppingCartIcon className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">BOQ Planned vs Actual Comparison</h1>
              <p className="text-gray-600">Compare original BOQ with actual purchases</p>
            </div>
          </div>
        </div>

        {/* BOQ Selection - Card Format */}
        {!selectedBOQ && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Select Project BOQ</h2>
            {boqList.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No completed BOQs found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {boqList.map((boq) => (
                  <motion.div
                    key={boq.boq_id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => handleBOQChange(boq.boq_id)}
                    className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 cursor-pointer hover:shadow-lg transition-all border-2 border-blue-200 hover:border-blue-400"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <DocumentTextIcon className="w-8 h-8 text-blue-600" />
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-semibold">
                        {boq.status || boq.boq_status || 'Completed'}
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-800 mb-1 line-clamp-1">
                      {boq.project_name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-1">{boq.boq_name}</p>
                    <div className="space-y-1 text-xs text-gray-600">
                      <div className="flex justify-between">
                        <span>BOQ ID:</span>
                        <span className="font-semibold text-gray-800">#{boq.boq_id}</span>
                      </div>
                      {boq.created_at && (
                        <div className="flex justify-between">
                          <span>Created:</span>
                          <span className="font-semibold text-gray-800">
                            {new Date(boq.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <button className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
                        View Comparison
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selected BOQ Header - Show after selection */}
        {selectedBOQ && !loading && (
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 mb-6 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DocumentTextIcon className="w-6 h-6 text-purple-600" />
                <div>
                  <h3 className="font-bold text-gray-800">{selectedBOQ.project_name}</h3>
                  <p className="text-sm text-gray-600">{selectedBOQ.boq_name} - BOQ #{selectedBOQ.boq_id}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedBOQ(null);
                  setPlannedBoqData(null);
                  setComparisonData(null);
                }}
                className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm font-semibold border border-gray-300"
              >
                ← Change BOQ
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading BOQ data...</p>
          </div>
        )}

        {/* Two Column Layout */}
        {!loading && plannedBoqData && comparisonData && (
          <div className="grid grid-cols-2 gap-6">
            {/* LEFT COLUMN - PLANNED BOQ */}
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <DocumentTextIcon className="w-6 h-6 text-blue-600" />
                  <h2 className="text-xl font-bold text-gray-800">Planned BOQ</h2>
                </div>
                <p className="text-sm text-gray-600">Original estimated costs</p>
              </div>

              {/* Planned Summary */}
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="font-bold text-gray-800 mb-4">Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Items:</span>
                    <span className="font-semibold">{plannedBoqData.summary?.total_items || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Sub Items:</span>
                    <span className="font-semibold">{plannedBoqData.summary?.total_materials || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Labour:</span>
                    <span className="font-semibold">{plannedBoqData.summary?.total_labour || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Sub Item Cost:</span>
                    <span className="font-semibold">AED{(plannedBoqData.summary?.total_material_cost || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Labour Cost:</span>
                    <span className="font-semibold">AED{(plannedBoqData.summary?.total_labour_cost || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-gray-600 font-semibold">Planned Total:</span>
                    <span className="font-bold text-blue-600">AED{(
                      plannedBoqData.items?.reduce((sum: number, item: any) =>
                        sum + (parseFloat(item.selling_price_before_discount || item.total_cost || item.selling_price) || 0), 0) ||
                      plannedBoqData.summary?.total_cost || 0
                    ).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Selling Price (after discount):</span>
                    <span className="text-gray-700">AED{(plannedBoqData.summary?.selling_price || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Planned Items */}
              {plannedBoqData.items?.map((item: any, idx: number) => (
                <div key={idx} className="bg-white rounded-xl shadow-md p-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">{item.item_name}</h3>

                  {/* Materials */}
                  {item.materials?.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Sub Items</h4>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs">Sub Item</th>
                            <th className="px-3 py-2 text-right text-xs">Qty</th>
                            <th className="px-3 py-2 text-right text-xs">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.materials.map((mat: any, mIdx: number) => (
                            <tr key={mIdx} className="border-t">
                              <td className="px-3 py-2">{mat.sub_item_name || mat.material_name}</td>
                              <td className="px-3 py-2 text-right">{mat.quantity} {mat.unit}</td>
                              <td className="px-3 py-2 text-right">AED{(mat.total_price || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Labour */}
                  {item.labour?.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Labour</h4>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs">Role</th>
                            <th className="px-3 py-2 text-right text-xs">Hours</th>
                            <th className="px-3 py-2 text-right text-xs">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.labour.map((lab: any, lIdx: number) => (
                            <tr key={lIdx} className="border-t">
                              <td className="px-3 py-2">{lab.labour_role}</td>
                              <td className="px-3 py-2 text-right">{lab.hours} hrs</td>
                              <td className="px-3 py-2 text-right">AED{(lab.total_cost || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Totals */}
                  <div className="pt-3 border-t text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Base Cost:</span>
                      <span className="font-semibold">AED{(item.base_cost || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Overhead ({item.overhead_percentage}%):</span>
                      <span className="font-semibold">AED{(item.overhead_amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Profit ({item.profit_margin_percentage}%):</span>
                      <span className="font-semibold">AED{(item.profit_margin_amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="font-semibold">Selling Price:</span>
                      <span className="font-bold text-blue-600">AED{(item.selling_price || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* RIGHT COLUMN - COMPARISON */}
            <div className="space-y-4">
              <div className="bg-purple-50 p-4 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingCartIcon className="w-6 h-6 text-purple-600" />
                  <h2 className="text-xl font-bold text-gray-800">Actual vs Planned</h2>
                </div>
                <p className="text-sm text-gray-600">Real-time cost tracking and variances</p>
              </div>

              {/* Comparison Summary */}
              <div className="bg-white rounded-xl shadow-md p-6">
                <h3 className="font-bold text-gray-800 mb-4">Overall Summary</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-600">Planned Total</p>
                    <p className="text-lg font-bold text-blue-600">AED{(comparisonData.summary?.planned_total || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Actual Total</p>
                    <p className="text-lg font-bold text-green-600">AED{(comparisonData.summary?.actual_total || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Variance</p>
                    <p className={`text-lg font-bold ${
                      comparisonData.summary?.status === 'under_budget' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      AED{(comparisonData.summary?.variance || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-gray-50 rounded">
                  <p className="text-sm font-semibold">Status: <span className={
                    comparisonData.summary?.status === 'under_budget' ? 'text-green-600' : 'text-red-600'
                  }>{comparisonData.summary?.status}</span></p>
                </div>
              </div>

              {/* Comparison Items */}
              {comparisonData.items?.map((item: any, idx: number) => (
                <div key={idx} className="bg-white rounded-xl shadow-md p-6">
                  <h3 className="text-lg font-bold text-gray-800 mb-4">{item.item_name}</h3>

                  {/* Materials Comparison */}
                  {item.materials?.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Sub Items</h4>
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-1 text-left">Sub Item</th>
                            <th className="px-2 py-1 text-right">Planned</th>
                            <th className="px-2 py-1 text-right">Actual</th>
                            <th className="px-2 py-1 text-left">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.materials.map((mat: any, mIdx: number) => (
                            <tr key={mIdx} className={`border-t ${mat.status === 'unplanned' ? 'bg-yellow-50' : ''}`}>
                              <td className="px-2 py-2">
                                {mat.sub_item_name || mat.material_name}
                                {mat.status === 'unplanned' && (
                                  <span className="ml-1 text-[10px] bg-yellow-200 px-1 rounded">Unplanned</span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right">
                                {mat.planned ? `AED${mat.planned.total.toFixed(2)}` : '-'}
                              </td>
                              <td className="px-2 py-2 text-right">
                                {mat.status === 'pending' ? (
                                  <span className="text-gray-500 italic">AED{mat.planned?.total.toFixed(2) || '0.00'}</span>
                                ) : (
                                  `AED${(mat.actual?.total || 0).toFixed(2)}`
                                )}
                              </td>
                              <td className="px-2 py-2 text-left text-[11px]">
                                {(mat.variance_reason || mat.variance?.reason) ? (
                                  <div>
                                    <div className={`${
                                      mat.variance?.status === 'overrun' ? 'text-red-600' :
                                      mat.variance?.status === 'saved' ? 'text-green-600' :
                                      mat.variance?.status === 'unplanned' ? 'text-orange-600' :
                                      'text-gray-600'
                                    }`}>
                                      {mat.variance_reason || mat.variance?.reason}
                                    </div>
                                    {mat.variance_response && (
                                      <div className="text-blue-600 mt-1 italic">
                                        Response: {mat.variance_response}
                                      </div>
                                    )}
                                  </div>
                                ) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Labour Comparison */}
                  {item.labour?.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Labour</h4>
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-1 text-left">Role</th>
                            <th className="px-2 py-1 text-right">Planned</th>
                            <th className="px-2 py-1 text-right">Actual</th>
                            <th className="px-2 py-1 text-left">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.labour.map((lab: any, lIdx: number) => (
                            <tr key={lIdx} className="border-t">
                              <td className="px-2 py-2">{lab.labour_role}</td>
                              <td className="px-2 py-2 text-right">AED{(lab.planned?.total || 0).toFixed(2)}</td>
                              <td className="px-2 py-2 text-right">
                                {lab.status === 'pending' ? (
                                  <span className="text-gray-500 italic">AED{(lab.planned?.total || 0).toFixed(2)}</span>
                                ) : (
                                  `AED${(lab.actual?.total || 0).toFixed(2)}`
                                )}
                              </td>
                              <td className="px-2 py-2 text-left text-[11px]">
                                {lab.variance_reason ? (
                                  <div>
                                    <div className={`${
                                      lab.variance?.status === 'overrun' ? 'text-red-600' :
                                      lab.variance?.status === 'saved' ? 'text-green-600' :
                                      'text-gray-600'
                                    }`}>
                                      {lab.variance_reason}
                                    </div>
                                    {lab.variance_response && (
                                      <div className="text-blue-600 mt-1 italic">
                                        Response: {lab.variance_response}
                                      </div>
                                    )}
                                  </div>
                                ) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Financial Summary */}
                  <div className="space-y-3">
                    {/* Overhead Card */}
                    <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-gray-800">Overhead ({item.planned?.overhead_percentage || 10}%)</h4>
                        {(item.consumption_flow?.overhead_consumed || 0) >= (item.planned?.overhead_amount || 0) && (
                          <span className="text-[10px] text-red-700 bg-red-200 px-2 py-1 rounded font-semibold">
                            Fully Used
                          </span>
                        )}
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Allocated:</span>
                          <span className="font-semibold">AED{(item.planned?.overhead_amount || 0).toFixed(2)}</span>
                        </div>
                        {(item.consumption_flow?.extra_costs || 0) > 0 && (
                          <div className="flex justify-between text-orange-700">
                            <span>Extra Costs:</span>
                            <span className="font-semibold">AED{(item.consumption_flow?.extra_costs || 0).toFixed(2)}</span>
                          </div>
                        )}
                        {(item.consumption_flow?.overhead_consumed || 0) > 0 && (
                          <div className="flex justify-between text-red-600">
                            <span>Consumed:</span>
                            <span className="font-bold">AED{(item.consumption_flow?.overhead_consumed || 0).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-orange-300 pt-2 mt-2">
                          <span className="font-bold text-gray-800">Balance:</span>
                          <span className={`font-bold text-lg ${
                            (item.actual?.overhead_amount || 0) === 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            AED{(item.actual?.overhead_amount || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      {(item.consumption_flow?.overhead_consumed || 0) >= (item.planned?.overhead_amount || 0) && (
                        <div className="mt-3 text-[10px] text-red-700 bg-red-100 px-2 py-1 rounded flex items-center gap-1">
                          <span>⚠️</span>
                          <span>Overhead fully consumed - Excess flows to Profit</span>
                        </div>
                      )}
                    </div>

                    {/* Profit/Loss Card */}
                    <div
                      className={`rounded-lg p-4 cursor-pointer hover:shadow-xl transition-all border-2 ${
                        (item.actual?.profit_amount || 0) < 0
                          ? 'bg-gradient-to-br from-red-50 to-red-100 border-red-300 hover:border-red-400'
                          : 'bg-gradient-to-br from-green-50 to-green-100 border-green-300 hover:border-green-400'
                      }`}
                      onClick={() => {
                        setSelectedItemDetail(item);
                        setShowDetailModal(true);
                      }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-gray-800">
                          {(item.actual?.profit_amount || 0) < 0 ? '⚠️ Loss' : '✓ Profit'}
                        </h4>
                        <span className="text-[10px] text-gray-500 bg-white px-2 py-1 rounded">Click for details</span>
                      </div>
                      <div className={`text-3xl font-bold text-center mb-3 ${
                        (item.actual?.profit_amount || 0) < 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        AED{Math.abs(item.actual?.profit_amount || 0).toFixed(2)}
                      </div>
                      <div className="text-xs border-t pt-2 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Allocated:</span>
                          <span className="font-semibold">AED{(item.planned?.profit_amount || 0).toFixed(2)}</span>
                        </div>
                        {(item.consumption_flow?.profit_consumed || 0) > 0 && (
                          <>
                            <div className="flex justify-between text-orange-700">
                              <span>Overflow from Overhead:</span>
                              <span className="font-semibold">AED{(item.consumption_flow?.profit_consumed || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-red-600">
                              <span>Consumed:</span>
                              <span className="font-bold">AED{(item.consumption_flow?.profit_consumed || 0).toFixed(2)}</span>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between border-t border-green-300 pt-2 mt-2">
                          <span className="font-bold text-gray-800">Balance:</span>
                          <span className={`font-bold text-lg ${
                            (item.actual?.profit_amount || 0) < (item.planned?.profit_amount || 0) ? 'text-red-600' : 'text-green-600'
                          }`}>
                            AED{(item.actual?.profit_amount || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Completion Status */}
                  {item.completion_status && (
                    <div className="mt-3 p-2 bg-blue-50 rounded text-xs">
                      <div className="flex justify-between mb-1">
                        <span>Completion:</span>
                        <span className="font-semibold">{item.completion_status.percentage}%</span>
                      </div>
                      <div className="text-gray-600">
                        Sub Items: {item.completion_status.materials_completed} |
                        Labour: {item.completion_status.labour_completed}
                        {item.completion_status.unplanned_materials > 0 && (
                          <span className="ml-1 text-orange-600">
                            | ⚠️ {item.completion_status.unplanned_materials} Unplanned
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !plannedBoqData && selectedBOQ && (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <p className="text-gray-500">Loading BOQ data...</p>
          </div>
        )}
      </motion.div>

      {/* Detail Modal */}
      {showDetailModal && selectedItemDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-t-xl">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Profit/Loss Breakdown: {selectedItemDetail.item_name}</h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-white hover:text-gray-200 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Planned Breakdown */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-800 mb-3">Planned Financial Breakdown</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Sub Item Cost:</span>
                    <span className="font-semibold">AED{(selectedItemDetail.planned?.materials_total || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Labour Cost:</span>
                    <span className="font-semibold">AED{(selectedItemDetail.planned?.labour_total || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-700 font-semibold">Base Cost:</span>
                    <span className="font-bold">AED{(selectedItemDetail.planned?.base_cost || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Overhead ({selectedItemDetail.planned?.overhead_percentage || 0}%):</span>
                    <span className="font-semibold">AED{(selectedItemDetail.planned?.overhead_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-700 font-semibold">Total Cost:</span>
                    <span className="font-bold">AED{(selectedItemDetail.planned?.total || selectedItemDetail.planned?.total_cost || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between bg-green-100 p-2 rounded mt-2">
                    <span className="text-green-700 font-bold">Planned Profit:</span>
                    <span className="text-green-700 font-bold">AED{(selectedItemDetail.planned?.profit_amount || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Actual Breakdown */}
              <div className="bg-purple-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-800 mb-3">Actual Financial Breakdown</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Sub Item Cost:</span>
                    <span className="font-semibold">AED{(selectedItemDetail.actual?.materials_total || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Labour Cost:</span>
                    <span className="font-semibold">AED{(selectedItemDetail.actual?.labour_total || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-700 font-semibold">Base Cost:</span>
                    <span className="font-bold">AED{(selectedItemDetail.actual?.base_cost || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">
                      Overhead ({selectedItemDetail.planned?.overhead_percentage || 0}% on actual base):
                    </span>
                    <span className="font-semibold">AED{(selectedItemDetail.actual?.overhead_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-gray-700 font-semibold">Total Cost:</span>
                    <span className="font-bold">AED{(selectedItemDetail.actual?.total || selectedItemDetail.actual?.total_cost || 0).toFixed(2)}</span>
                  </div>
                  <div className={`flex justify-between p-2 rounded mt-2 ${
                    (selectedItemDetail.actual?.profit_amount || 0) < 0 ? 'bg-red-100' : 'bg-green-100'
                  }`}>
                    <span className={`font-bold ${
                      (selectedItemDetail.actual?.profit_amount || 0) < 0 ? 'text-red-700' : 'text-green-700'
                    }`}>
                      Actual {(selectedItemDetail.actual?.profit_amount || 0) < 0 ? 'Loss' : 'Profit'}:
                    </span>
                    <span className={`font-bold ${
                      (selectedItemDetail.actual?.profit_amount || 0) < 0 ? 'text-red-700' : 'text-green-700'
                    }`}>
                      AED{(selectedItemDetail.actual?.profit_amount || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Variance Analysis */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-bold text-gray-800 mb-3">Variance Analysis</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Sub Item Cost Variance:</span>
                    <span className={
                      ((selectedItemDetail.actual?.materials_total || 0) - (selectedItemDetail.planned?.materials_total || 0)) > 0
                        ? 'text-red-600 font-semibold'
                        : 'text-green-600 font-semibold'
                    }>
                      {((selectedItemDetail.actual?.materials_total || 0) - (selectedItemDetail.planned?.materials_total || 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Labour Cost Variance:</span>
                    <span className={
                      ((selectedItemDetail.actual?.labour_total || 0) - (selectedItemDetail.planned?.labour_total || 0)) > 0
                        ? 'text-red-600 font-semibold'
                        : 'text-green-600 font-semibold'
                    }>
                      {((selectedItemDetail.actual?.labour_total || 0) - (selectedItemDetail.planned?.labour_total || 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Overhead Variance:</span>
                    <span className={
                      ((selectedItemDetail.actual?.overhead_amount || 0) - (selectedItemDetail.planned?.overhead_amount || 0)) > 0
                        ? 'text-red-600 font-semibold'
                        : 'text-green-600 font-semibold'
                    }>
                      {((selectedItemDetail.actual?.overhead_amount || 0) - (selectedItemDetail.planned?.overhead_amount || 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2 mt-2">
                    <span className="text-gray-700 font-bold">Profit/Loss Variance:</span>
                    <span className={
                      (selectedItemDetail.variance?.profit?.difference || 0) < 0
                        ? 'text-red-600 font-bold'
                        : 'text-green-600 font-bold'
                    }>
                      {(selectedItemDetail.variance?.profit?.difference || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Formula Explanation */}
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <h3 className="font-bold text-gray-800 mb-2 flex items-center">
                  <span className="text-yellow-600 mr-2">💡</span>
                  Calculation Formula
                </h3>
                <div className="text-xs text-gray-700 space-y-2">
                  <div>
                    <p className="font-semibold mb-1">Base Calculations:</p>
                    <p><strong>Planned Cost</strong> = Materials + Labour</p>
                    <p><strong>Overhead Allocated</strong> = Planned Cost × (Overhead % ÷ 100)</p>
                    <p><strong>Profit Allocated</strong> = Selling Price - (Planned Cost + Overhead Allocated)</p>
                  </div>

                  <div className="border-t pt-2">
                    <p className="font-semibold mb-1">Consumption Model:</p>
                    <p><strong>Extra Costs</strong> = (Overruns on Planned Items) + (Unplanned Purchases)</p>
                    <p className="mt-1">1. Extra costs <strong>consume Overhead first</strong> (up to allocated amount)</p>
                    <p>2. If extra costs exceed overhead, then <strong>consume Profit</strong></p>
                  </div>

                  <div className="border-t pt-2 text-red-700 font-semibold">
                    <p><strong>Note:</strong> Total price is fixed. Pending materials use planned costs in calculations.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 p-4 rounded-b-xl flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
