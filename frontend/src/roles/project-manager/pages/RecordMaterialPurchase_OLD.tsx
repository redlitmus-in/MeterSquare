import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShoppingCartIcon, CheckCircleIcon, XCircleIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { toast } from 'sonner';
import { boqTrackingService } from '../services/boqTrackingService';
import axios from 'axios';

export default function RecordMaterialPurchase() {
  const [boqList, setBOQList] = useState<any[]>([]);
  const [selectedBOQ, setSelectedBOQ] = useState<any | null>(null);
  const [plannedBoqData, setPlannedBoqData] = useState<any | null>(null);
  const [comparisonData, setComparisonData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBOQs();
  }, []);

  const fetchBOQs = async () => {
    try {
      const response = await boqTrackingService.getAllBOQs();
      console.log('All BOQ Response:', response);

      const allBOQs = Array.isArray(response) ? response : (response.boqs || []);

      // Filter only BOQs with status "completed"
      const completedBOQs = allBOQs.filter((boq: any) => {
        const status = (boq.status || boq.boq_status || '').toLowerCase();
        return status === 'completed';
      });

      console.log(`Found ${completedBOQs.length} completed BOQs out of ${allBOQs.length} total`);
      setBOQList(completedBOQs);

      if (completedBOQs.length === 0) {
        toast.info('No completed BOQs found. Please complete a BOQ first.');
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
      // Fetch both planned BOQ and comparison data
      await Promise.all([
        fetchPlannedBOQ(boqId),
        fetchComparison(boqId)
      ]);
    }
  };

  const fetchPlannedBOQ = async (boqId: number) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://localhost:5000/api/boq/${boqId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Planned BOQ data:', response.data);
      setPlannedBoqData(response.data);
    } catch (error: any) {
      console.error('Error fetching planned BOQ:', error);
      toast.error(error.response?.data?.error || 'Failed to load planned BOQ');
    }
  };

  const fetchComparison = async (boqId: number) => {
    setLoading(true);
    try {
      const data = await boqTrackingService.getPlannedVsActual(boqId);
      console.log('Planned vs Actual data:', data);
      setComparisonData(data);
      toast.success('BOQ comparison loaded successfully!');
    } catch (error: any) {
      console.error('Error fetching comparison:', error);
      toast.error(error.response?.data?.error || 'Failed to load BOQ comparison');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 shadow-md mb-6">
          <div className="flex items-center gap-3">
            <ShoppingCartIcon className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Record Material Purchase</h1>
              <p className="text-gray-600">Track actual material purchases against planned BOQ</p>
            </div>
          </div>
        </div>

        {/* BOQ Selection */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Select Project BOQ *
            </label>
            <select
              value={selectedBOQ?.boq_id || ''}
              onChange={(e) => handleBOQChange(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              <option value="">-- Select BOQ --</option>
              {boqList.map(boq => (
                <option key={boq.boq_id} value={boq.boq_id}>
                  {boq.project_name} - {boq.boq_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading BOQ data...</p>
          </div>
        )}

        {/* Two Column Layout: Planned BOQ (Left) | Comparison (Right) */}
        {!loading && plannedBoqData && comparisonData && (
          <div className="grid grid-cols-2 gap-6">(
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 shadow-md">
              <h2 className="text-xl font-bold text-gray-800 mb-4">BOQ Summary</h2>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Planned Total</p>
                  <p className="text-2xl font-bold text-blue-600">
                    ₹{comparisonData.summary?.planned_total?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Actual Total</p>
                  <p className="text-2xl font-bold text-green-600">
                    ₹{comparisonData.summary?.actual_total?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Variance</p>
                  <p className={`text-2xl font-bold ${
                    (comparisonData.summary?.variance || 0) > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {(comparisonData.summary?.variance || 0) > 0 ? '+' : ''}
                    ₹{comparisonData.summary?.variance?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className={`text-2xl font-bold ${
                    comparisonData.summary?.status === 'under_budget' ? 'text-green-600' :
                    comparisonData.summary?.status === 'over_budget' ? 'text-red-600' : 'text-blue-600'
                  }`}>
                    {comparisonData.summary?.status === 'under_budget' ? '✓ Under' :
                     comparisonData.summary?.status === 'over_budget' ? '✗ Over' : '= On Budget'}
                  </p>
                </div>
              </div>
            </div>

            {/* Items Breakdown */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-gray-800">Items Breakdown</h2>

              {comparisonData.items?.map((item: any, idx: number) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-white rounded-xl shadow-md p-6"
                >
                  <h3 className="text-lg font-bold text-gray-800 mb-4">{item.item_name}</h3>

                  {/* Materials */}
                  {item.materials?.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-md font-semibold text-gray-700 mb-3">Materials</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Planned Qty</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actual Qty</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Planned Price</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actual Price</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {item.materials.map((mat: any, matIdx: number) => (
                              <tr key={matIdx} className={`hover:bg-gray-50 ${mat.status === 'unplanned' ? 'bg-yellow-50' : ''}`}>
                                <td className="px-4 py-3 text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-900">{mat.material_name}</span>
                                    {mat.status === 'unplanned' && (
                                      <span className="px-2 py-0.5 text-xs font-medium bg-yellow-200 text-yellow-800 rounded">
                                        Unplanned
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">
                                  {mat.planned ? `${mat.planned.quantity} ${mat.planned.unit}` : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">
                                  {mat.actual?.quantity || 0} {mat.actual?.unit || mat.planned?.unit || ''}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">
                                  {mat.planned ? `₹${mat.planned.total.toFixed(2)}` : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">
                                  ₹{(mat.actual?.total || 0).toFixed(2)}
                                </td>
                                <td className={`px-4 py-3 text-sm text-right font-semibold ${
                                  mat.status === 'unplanned' ? 'text-orange-600' :
                                  (mat.variance?.total || 0) > 0 ? 'text-red-600' : 'text-green-600'
                                }`}>
                                  {mat.status === 'unplanned' ? 'Unplanned' : (
                                    <>
                                      {(mat.variance?.total || 0) > 0 ? '+' : ''}
                                      ₹{(mat.variance?.total || 0).toFixed(2)}
                                    </>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {mat.status === 'completed' ? (
                                    <CheckCircleIcon className="w-5 h-5 text-green-500 mx-auto" />
                                  ) : mat.status === 'unplanned' ? (
                                    <span className="text-xs font-semibold text-orange-600">⚠️</span>
                                  ) : (
                                    <XCircleIcon className="w-5 h-5 text-gray-400 mx-auto" />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Labour */}
                  {item.labour?.length > 0 && (
                    <div>
                      <h4 className="text-md font-semibold text-gray-700 mb-3">Labour</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Planned Hours</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actual Hours</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Planned Cost</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actual Cost</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
                              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {item.labour.map((lab: any, labIdx: number) => (
                              <tr key={labIdx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-900">{lab.labour_role}</td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">
                                  {lab.planned.hours} hrs
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">
                                  {lab.actual?.hours || 0} hrs
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">
                                  ₹{(lab.planned?.total || 0).toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-sm text-right text-gray-600">
                                  ₹{(lab.actual?.total || 0).toFixed(2)}
                                </td>
                                <td className={`px-4 py-3 text-sm text-right font-semibold ${
                                  (lab.variance?.total || 0) > 0 ? 'text-red-600' : 'text-green-600'
                                }`}>
                                  {(lab.variance?.total || 0) > 0 ? '+' : ''}
                                  ₹{(lab.variance?.total || 0).toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {lab.status === 'recorded' ? (
                                    <CheckCircleIcon className="w-5 h-5 text-green-500 mx-auto" />
                                  ) : (
                                    <XCircleIcon className="w-5 h-5 text-gray-400 mx-auto" />
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Item Summary with Detailed Breakdown */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    {/* Main Totals */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <span className="text-xs text-gray-600 block">Planned Total</span>
                        <p className="text-lg font-bold text-blue-600">₹{(item.planned?.total || 0).toFixed(2)}</p>
                      </div>
                      <div className="bg-green-50 p-3 rounded-lg">
                        <span className="text-xs text-gray-600 block">Actual Total</span>
                        <p className="text-lg font-bold text-green-600">₹{(item.actual?.total || 0).toFixed(2)}</p>
                      </div>
                      <div className={`p-3 rounded-lg ${
                        (item.savings_breakdown?.total_cost_savings || 0) < 0 ? 'bg-red-50' : 'bg-green-50'
                      }`}>
                        <span className="text-xs text-gray-600 block">Cost Variance</span>
                        <p className={`text-lg font-bold ${
                          (item.savings_breakdown?.total_cost_savings || 0) < 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {(item.savings_breakdown?.total_cost_savings || 0) > 0 ? '+' : ''}
                          ₹{(item.savings_breakdown?.total_cost_savings || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="bg-purple-50 p-3 rounded-lg">
                        <span className="text-xs text-gray-600 block">Selling Price</span>
                        <p className="text-lg font-bold text-purple-600">₹{(item.planned?.selling_price || 0).toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Overhead Details */}
                    <div className="bg-orange-50 p-4 rounded-lg mb-3">
                      <h5 className="text-sm font-semibold text-gray-700 mb-2">Overhead Breakdown</h5>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-xs text-gray-600 block">Planned Overhead</span>
                          <p className="font-semibold text-gray-800">₹{(item.planned?.overhead_amount || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-600 block">Actual Overhead</span>
                          <p className="font-semibold text-gray-800">₹{(item.actual?.overhead_amount || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-600 block">Difference</span>
                          <p className={`font-semibold ${
                            (item.variance?.overhead?.difference || 0) < 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {(item.variance?.overhead?.difference || 0) > 0 ? '+' : ''}
                            ₹{Math.abs(item.variance?.overhead?.difference || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Profit Details */}
                    <div className={`p-4 rounded-lg ${
                      (item.actual?.profit_amount || 0) < 0 ? 'bg-red-50' : 'bg-green-50'
                    }`}>
                      <h5 className="text-sm font-semibold text-gray-700 mb-2">Profit/Loss Breakdown</h5>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-xs text-gray-600 block">Planned Profit</span>
                          <p className="font-semibold text-gray-800">₹{(item.planned?.profit_amount || 0).toFixed(2)}</p>
                          <span className="text-xs text-gray-500">({(item.planned?.profit_percentage || 0).toFixed(2)}%)</span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-600 block">Actual Profit/Loss</span>
                          <p className={`font-semibold ${
                            (item.actual?.profit_amount || 0) < 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            ₹{(item.actual?.profit_amount || 0).toFixed(2)}
                          </p>
                          <span className={`text-xs ${
                            (item.actual?.profit_amount || 0) < 0 ? 'text-red-500' : 'text-green-500'
                          }`}>
                            ({(item.actual?.profit_percentage || 0).toFixed(2)}%)
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-gray-600 block">Difference</span>
                          <p className={`font-semibold ${
                            (item.variance?.profit?.difference || 0) < 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {(item.variance?.profit?.difference || 0) > 0 ? '+' : ''}
                            ₹{(item.variance?.profit?.difference || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                      {(item.actual?.profit_amount || 0) < 0 && (
                        <div className="mt-2 p-2 bg-red-100 rounded text-xs text-red-700">
                          ⚠️ <strong>Loss Alert:</strong> Project is running at a loss of ₹{Math.abs(item.actual?.profit_amount || 0).toFixed(2)}
                        </div>
                      )}
                    </div>

                    {/* Completion Status */}
                    {item.completion_status && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Completion Status:</span>
                          <span className={`text-sm font-semibold ${
                            item.completion_status.is_fully_completed ? 'text-green-600' : 'text-orange-600'
                          }`}>
                            {item.completion_status.percentage}% Complete
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          Materials: {item.completion_status.materials_completed} |
                          Labour: {item.completion_status.labour_completed}
                          {item.completion_status.unplanned_materials > 0 && (
                            <span className="ml-2 text-orange-600 font-semibold">
                              | ⚠️ {item.completion_status.unplanned_materials} Unplanned Material{item.completion_status.unplanned_materials > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {item.completion_status.note && (
                          <div className="mt-1 text-xs text-orange-600">
                            {item.completion_status.note}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !comparisonData && selectedBOQ && (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <p className="text-gray-500">Select a BOQ to view comparison</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
