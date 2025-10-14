import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Package,
  Users,
  Calculator,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
} from 'lucide-react';
import { boqTrackingService } from '../../roles/project-manager/services/boqTrackingService';
import { toast } from 'sonner';

interface PlannedVsActualViewProps {
  boqId: number;
  onClose?: () => void;
}

const PlannedVsActualView: React.FC<PlannedVsActualViewProps> = ({ boqId, onClose }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItemForBreakdown, setSelectedItemForBreakdown] = useState<any>(null);
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, [boqId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await boqTrackingService.getPlannedVsActual(boqId);
      setData(response);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load BOQ comparison');
      console.error('Error fetching planned vs actual:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return `AED${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const openBreakdownModal = (item: any) => {
    setSelectedItemForBreakdown(item);
    setShowBreakdownModal(true);
  };

  const closeBreakdownModal = () => {
    setShowBreakdownModal(false);
    setSelectedItemForBreakdown(null);
  };

  const getVarianceIcon = (status: string) => {
    switch (status) {
      case 'saved':
      case 'under_budget':
        return <TrendingDown className="w-3 h-3 text-green-600" />;
      case 'overrun':
      case 'over_budget':
        return <TrendingUp className="w-3 h-3 text-red-600" />;
      case 'on_budget':
        return <Minus className="w-3 h-3 text-gray-600" />;
      case 'unplanned':
        return <AlertCircle className="w-3 h-3 text-orange-600" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading comparison data...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 inline-block">
          <p className="text-yellow-800">No data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-xl p-6 border border-slate-600 shadow-lg">
        <h2 className="text-2xl font-bold text-white mb-2">{data.boq_name}</h2>
        <p className="text-sm text-slate-200">Real-time Cost Tracking & Variance Analysis</p>
      </div>

      {/* Each Item in Separate Section */}
      {data.items?.map((item: any, index: number) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-white rounded-xl shadow-lg border-2 border-gray-200 overflow-hidden"
        >
          {/* Item Header */}
          <div className="bg-gradient-to-r from-gray-100 to-gray-200 px-6 py-4 border-b-2 border-gray-300">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">{item.item_name}</h3>
              <button
                onClick={() => openBreakdownModal(item)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <Calculator className="w-4 h-4" />
                Click for details
              </button>
            </div>
          </div>

          {/* Side-by-Side Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-x-2 divide-gray-300">
            {/* LEFT SIDE - PLANNED */}
            <div className="p-6 bg-blue-50">
              <div className="mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                <h4 className="text-lg font-bold text-blue-900">📋 Planned</h4>
              </div>

              {/* Sub Items */}
              {item.materials.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3">Sub Items</h5>
                  <table className="w-full text-sm bg-white rounded-lg overflow-hidden border border-blue-200">
                    <thead className="bg-blue-100">
                      <tr>
                        <th className="text-left py-2 px-3 text-blue-900 font-semibold">Sub Item</th>
                        <th className="text-right py-2 px-3 text-blue-900 font-semibold">Planned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.materials.map((mat: any, mIdx: number) => (
                        <tr key={mIdx} className={`border-t border-blue-100 ${mIdx % 2 === 0 ? 'bg-blue-50' : 'bg-white'}`}>
                          <td className="py-2 px-3 text-gray-900">{mat.sub_item_name || mat.material_name}</td>
                          <td className="py-2 px-3 text-right font-semibold text-blue-700">
                            {formatCurrency(mat.planned.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Labour */}
              {item.labour.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3">Labour</h5>
                  <table className="w-full text-sm bg-white rounded-lg overflow-hidden border border-blue-200">
                    <thead className="bg-blue-100">
                      <tr>
                        <th className="text-left py-2 px-3 text-blue-900 font-semibold">Role</th>
                        <th className="text-right py-2 px-3 text-blue-900 font-semibold">Planned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.labour.map((lab: any, lIdx: number) => (
                        <tr key={lIdx} className={`border-t border-blue-100 ${lIdx % 2 === 0 ? 'bg-blue-50' : 'bg-white'}`}>
                          <td className="py-2 px-3 text-gray-900">{lab.labour_role}</td>
                          <td className="py-2 px-3 text-right font-semibold text-blue-700">
                            {formatCurrency(lab.planned.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* RIGHT SIDE - ACTUAL */}
            <div className="p-6 bg-purple-50">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                <h4 className="text-lg font-bold text-purple-900">🛒 Actual</h4>
              </div>

              {/* Sub Items */}
              {item.materials.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3">Sub Items</h5>
                  <table className="w-full text-sm bg-white rounded-lg overflow-hidden border border-purple-200">
                    <thead className="bg-purple-100">
                      <tr>
                        <th className="text-left py-2 px-3 text-purple-900 font-semibold">Sub Item</th>
                        <th className="text-right py-2 px-3 text-purple-900 font-semibold">Actual</th>
                        <th className="text-left py-2 px-3 text-purple-900 font-semibold">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.materials.map((mat: any, mIdx: number) => (
                        <tr key={mIdx} className={`border-t border-purple-100 ${mIdx % 2 === 0 ? 'bg-purple-50' : 'bg-white'}`}>
                          <td className="py-2 px-3 text-gray-900">
                            <div className="flex items-center gap-2">
                              {mat.sub_item_name || mat.material_name}
                              {mat.status === 'unplanned' && (
                                <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded font-medium">
                                  NEW
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className={`font-semibold ${
                                mat.variance?.status === 'overrun' ? 'text-red-600' :
                                mat.variance?.status === 'saved' ? 'text-green-600' :
                                'text-purple-700'
                              }`}>
                                {mat.actual ? formatCurrency(mat.actual.total) :
                                 mat.planned ? formatCurrency(mat.planned.total) : '-'}
                              </span>
                              {mat.variance && getVarianceIcon(mat.variance.status)}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-600">
                            {mat.variance_reason || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Labour */}
              {item.labour.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3">Labour</h5>
                  <table className="w-full text-sm bg-white rounded-lg overflow-hidden border border-purple-200">
                    <thead className="bg-purple-100">
                      <tr>
                        <th className="text-left py-2 px-3 text-purple-900 font-semibold">Role</th>
                        <th className="text-right py-2 px-3 text-purple-900 font-semibold">Actual</th>
                        <th className="text-left py-2 px-3 text-purple-900 font-semibold">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.labour.map((lab: any, lIdx: number) => (
                        <tr key={lIdx} className={`border-t border-purple-100 ${lIdx % 2 === 0 ? 'bg-purple-50' : 'bg-white'}`}>
                          <td className="py-2 px-3 text-gray-900">{lab.labour_role}</td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className={`font-semibold ${
                                lab.variance?.status === 'overrun' ? 'text-red-600' :
                                lab.variance?.status === 'saved' ? 'text-green-600' :
                                'text-purple-700'
                              }`}>
                                {lab.actual ? formatCurrency(lab.actual.total) : formatCurrency(lab.planned.total)}
                              </span>
                              {lab.variance && getVarianceIcon(lab.variance.status)}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-600">-</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Summary Bar */}
          <div className={`px-6 py-4 border-t-2 ${
            item.actual.profit_amount >= 0
              ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
              : 'bg-gradient-to-r from-red-50 to-pink-50 border-red-300'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Profit Status:</span>
                <span className={`text-lg font-bold ${
                  item.actual.profit_amount >= 0 ? 'text-green-700' : 'text-red-700'
                }`}>
                  {item.actual.profit_amount >= 0 ? '✓ Profit' : '✗ Loss'}
                </span>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${
                  item.actual.profit_amount >= 0 ? 'text-green-700' : 'text-red-700'
                }`}>
                  {formatCurrency(Math.abs(item.actual.profit_amount))}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      ))}

      {/* Overall Summary Section */}
      {data.summary && (
        <div className="space-y-6 mt-8">
          {/* Summary Header */}
          <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl p-6 border border-slate-600 shadow-lg">
            <h3 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Calculator className="w-6 h-6" />
              📊 Overall Summary - Planned vs Actual
            </h3>
            <p className="text-sm text-slate-300">Complete financial breakdown and variance analysis</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Planned Summary */}
            <div className="bg-white rounded-xl border-2 border-blue-300 shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Planned Financial Breakdown
                </h4>
              </div>
              <div className="p-6 space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600 font-medium">Sub Item Cost:</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(data.summary.planned_materials_total || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600 font-medium">Labour Cost:</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(data.summary.planned_labour_total || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b-2 border-gray-300">
                  <span className="text-gray-700 font-semibold">Base Cost:</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency((data.summary.planned_materials_total || 0) + (data.summary.planned_labour_total || 0))}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600 font-medium">Overhead (10%):</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(data.summary.total_planned_overhead || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b-2 border-gray-300">
                  <span className="text-gray-700 font-semibold">Total Cost:</span>
                  <span className="font-bold text-blue-700 text-lg">
                    {formatCurrency(data.summary.planned_total)}
                  </span>
                </div>
                <div className="flex justify-between py-3 bg-green-50 rounded-lg px-3 border-2 border-green-300">
                  <span className="text-green-900 font-bold">Planned Profit (15%):</span>
                  <span className="font-bold text-green-700 text-xl">
                    {formatCurrency(data.summary.total_planned_profit || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Actual Summary */}
            <div className="bg-white rounded-xl border-2 border-purple-300 shadow-lg overflow-hidden">
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Actual Financial Breakdown
                </h4>
              </div>
              <div className="p-6 space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600 font-medium">Sub Item Cost:</span>
                  <span className={`font-bold ${
                    (data.summary.actual_materials_total || 0) > (data.summary.planned_materials_total || 0)
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(data.summary.actual_materials_total || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600 font-medium">Labour Cost:</span>
                  <span className={`font-bold ${
                    (data.summary.actual_labour_total || 0) > (data.summary.planned_labour_total || 0)
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(data.summary.actual_labour_total || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b-2 border-gray-300">
                  <span className="text-gray-700 font-semibold">Base Cost:</span>
                  <span className={`font-bold ${
                    ((data.summary.actual_materials_total || 0) + (data.summary.actual_labour_total || 0)) >
                    ((data.summary.planned_materials_total || 0) + (data.summary.planned_labour_total || 0))
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency((data.summary.actual_materials_total || 0) + (data.summary.actual_labour_total || 0))}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600 font-medium">Overhead (10% on actual base):</span>
                  <span className={`font-bold ${
                    (data.summary.total_actual_overhead || 0) < (data.summary.total_planned_overhead || 0)
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(data.summary.total_actual_overhead || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b-2 border-gray-300">
                  <span className="text-gray-700 font-semibold">Total Cost:</span>
                  <span className={`font-bold text-lg ${
                    data.summary.actual_total > data.summary.planned_total
                      ? 'text-red-700'
                      : 'text-purple-700'
                  }`}>
                    {formatCurrency(data.summary.actual_total)}
                  </span>
                </div>
                <div className={`flex justify-between py-3 rounded-lg px-3 border-2 ${
                  (data.summary.total_actual_profit || 0) >= (data.summary.total_planned_profit || 0)
                    ? 'bg-green-50 border-green-300'
                    : 'bg-red-50 border-red-300'
                }`}>
                  <span className={`font-bold ${
                    (data.summary.total_actual_profit || 0) >= 0 ? 'text-green-900' : 'text-red-900'
                  }`}>
                    {(data.summary.total_actual_profit || 0) >= 0 ? 'Actual Profit (12.00%):' : 'Loss:'}
                  </span>
                  <span className={`font-bold text-xl ${
                    (data.summary.total_actual_profit || 0) >= 0 ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {formatCurrency(Math.abs(data.summary.total_actual_profit || 0))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Variance Analysis */}
          <div className="bg-white rounded-xl border-2 border-indigo-300 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-4">
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Variance Analysis
              </h4>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Sub Item Cost Variance:</p>
                  <p className={`text-lg font-bold ${
                    (data.summary.actual_materials_total || 0) - (data.summary.planned_materials_total || 0) > 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(Math.abs((data.summary.actual_materials_total || 0) - (data.summary.planned_materials_total || 0)))}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Labour Cost Variance:</p>
                  <p className={`text-lg font-bold ${
                    (data.summary.actual_labour_total || 0) - (data.summary.planned_labour_total || 0) > 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(Math.abs((data.summary.actual_labour_total || 0) - (data.summary.planned_labour_total || 0)))}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Overhead Variance:</p>
                  <p className={`text-lg font-bold ${
                    (data.summary.total_actual_overhead || 0) - (data.summary.total_planned_overhead || 0) < 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(Math.abs((data.summary.total_actual_overhead || 0) - (data.summary.total_planned_overhead || 0)))}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Profit/Loss Variance:</p>
                  <p className={`text-lg font-bold ${
                    (data.summary.total_actual_profit || 0) - (data.summary.total_planned_profit || 0) < 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(Math.abs((data.summary.total_actual_profit || 0) - (data.summary.total_planned_profit || 0)))}
                  </p>
                </div>
              </div>

              {/* Final Status */}
              <div className={`mt-6 p-6 rounded-xl border-4 text-center ${
                (data.summary.total_actual_profit || 0) >= 0
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400'
                  : 'bg-gradient-to-r from-red-50 to-pink-50 border-red-400'
              }`}>
                <p className="text-sm font-semibold text-gray-700 mb-2">Profit Status:</p>
                <p className={`text-4xl font-black mb-2 ${
                  (data.summary.total_actual_profit || 0) >= 0 ? 'text-green-700' : 'text-red-700'
                }`}>
                  {(data.summary.total_actual_profit || 0) >= 0 ? '✓ MAINTAINED' : '✗ REDUCED'}
                </p>
                <p className="text-sm text-gray-600">
                  Status: <span className={`font-bold ${
                    data.summary.status === 'on_budget' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {data.summary.status?.toUpperCase().replace('_', ' ') || 'ON BUDGET'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Breakdown Modal - Same as before */}
      {showBreakdownModal && selectedItemForBreakdown && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto"
          >
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Profit/Loss Breakdown: {selectedItemForBreakdown.item_name}</h3>
              <button
                onClick={closeBreakdownModal}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Planned Breakdown */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 border-2 border-blue-300">
                <h4 className="font-bold text-blue-900 mb-3">Planned Financial Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1">
                    <span>Sub Item Cost:</span>
                    <span className="font-semibold">{formatCurrency(selectedItemForBreakdown.planned.materials_total)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Labour Cost:</span>
                    <span className="font-semibold">{formatCurrency(selectedItemForBreakdown.planned.labour_total)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-t-2 border-blue-300 pt-2 font-semibold">
                    <span>Base Cost:</span>
                    <span>{formatCurrency(selectedItemForBreakdown.planned.base_cost)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Overhead ({selectedItemForBreakdown.planned.overhead_percentage}%):</span>
                    <span className="font-semibold">{formatCurrency(selectedItemForBreakdown.planned.overhead_amount)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-t-2 border-blue-300 pt-2 font-semibold">
                    <span>Total Cost:</span>
                    <span>{formatCurrency(selectedItemForBreakdown.planned.total)}</span>
                  </div>
                  <div className="flex justify-between py-2 bg-green-100 rounded px-2 border border-green-300 mt-2">
                    <span className="text-green-900 font-bold">Planned Profit ({selectedItemForBreakdown.planned.profit_percentage}%):</span>
                    <span className="font-bold text-green-700">{formatCurrency(selectedItemForBreakdown.planned.profit_amount)}</span>
                  </div>
                </div>
              </div>

              {/* Actual Breakdown */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border-2 border-purple-300">
                <h4 className="font-bold text-purple-900 mb-3">Actual Financial Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1">
                    <span>Sub Item Cost:</span>
                    <span className={`font-semibold ${
                      selectedItemForBreakdown.actual.materials_total > selectedItemForBreakdown.planned.materials_total
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}>
                      {formatCurrency(selectedItemForBreakdown.actual.materials_total)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Labour Cost:</span>
                    <span className={`font-semibold ${
                      selectedItemForBreakdown.actual.labour_total > selectedItemForBreakdown.planned.labour_total
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}>
                      {formatCurrency(selectedItemForBreakdown.actual.labour_total)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-t-2 border-purple-300 pt-2 font-semibold">
                    <span>Base Cost:</span>
                    <span className={
                      selectedItemForBreakdown.actual.base_cost > selectedItemForBreakdown.planned.base_cost
                        ? 'text-red-600'
                        : 'text-green-600'
                    }>
                      {formatCurrency(selectedItemForBreakdown.actual.base_cost)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Overhead (10% on actual base):</span>
                    <span className="font-semibold">{formatCurrency(selectedItemForBreakdown.actual.overhead_amount)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-t-2 border-purple-300 pt-2 font-semibold">
                    <span>Total Cost:</span>
                    <span className={
                      selectedItemForBreakdown.actual.total > selectedItemForBreakdown.planned.total
                        ? 'text-red-600'
                        : 'text-purple-600'
                    }>
                      {formatCurrency(selectedItemForBreakdown.actual.total)}
                    </span>
                  </div>
                  <div className={`flex justify-between py-2 rounded px-2 border mt-2 ${
                    selectedItemForBreakdown.actual.profit_amount >= 0
                      ? 'bg-green-100 border-green-300'
                      : 'bg-red-100 border-red-300'
                  }`}>
                    <span className={`font-bold ${
                      selectedItemForBreakdown.actual.profit_amount >= 0 ? 'text-green-900' : 'text-red-900'
                    }`}>
                      {selectedItemForBreakdown.actual.profit_amount >= 0
                        ? `Actual Profit (${selectedItemForBreakdown.actual.profit_percentage?.toFixed(2)}%):`
                        : 'Loss:'}
                    </span>
                    <span className={`font-bold ${
                      selectedItemForBreakdown.actual.profit_amount >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {formatCurrency(Math.abs(selectedItemForBreakdown.actual.profit_amount))}
                    </span>
                  </div>
                </div>
              </div>

              {/* Variance */}
              <div className="bg-yellow-50 rounded-lg p-4 border-2 border-yellow-300">
                <h4 className="font-bold text-yellow-900 mb-3">Variance Analysis</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Sub Item Cost Variance:</span>
                    <span className={`font-semibold ${
                      (selectedItemForBreakdown.actual.materials_total - selectedItemForBreakdown.planned.materials_total) > 0
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}>
                      {(selectedItemForBreakdown.actual.materials_total - selectedItemForBreakdown.planned.materials_total) > 0 ? '+' : ''}
                      {formatCurrency(Math.abs(selectedItemForBreakdown.actual.materials_total - selectedItemForBreakdown.planned.materials_total))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Labour Cost Variance:</span>
                    <span className={`font-semibold ${
                      (selectedItemForBreakdown.actual.labour_total - selectedItemForBreakdown.planned.labour_total) > 0
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}>
                      {(selectedItemForBreakdown.actual.labour_total - selectedItemForBreakdown.planned.labour_total) > 0 ? '+' : ''}
                      {formatCurrency(Math.abs(selectedItemForBreakdown.actual.labour_total - selectedItemForBreakdown.planned.labour_total))}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t-2 border-yellow-400 font-bold">
                    <span>Profit/Loss Variance:</span>
                    <span className={
                      (selectedItemForBreakdown.actual.profit_amount - selectedItemForBreakdown.planned.profit_amount) < 0
                        ? 'text-red-600'
                        : 'text-green-600'
                    }>
                      {(selectedItemForBreakdown.actual.profit_amount - selectedItemForBreakdown.planned.profit_amount) > 0 ? '+' : ''}
                      {formatCurrency(Math.abs(selectedItemForBreakdown.actual.profit_amount - selectedItemForBreakdown.planned.profit_amount))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default PlannedVsActualView;
