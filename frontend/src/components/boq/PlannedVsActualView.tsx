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

  // Calculate totals from items
  const calculateTotals = () => {
    if (!data?.items) return { planned_materials: 0, planned_labour: 0, actual_materials: 0, actual_labour: 0 };

    return data.items.reduce((acc: any, item: any) => {
      acc.planned_materials += item.planned.materials_total || 0;
      acc.planned_labour += item.planned.labour_total || 0;
      acc.actual_materials += item.actual.materials_total || 0;
      acc.actual_labour += item.actual.labour_total || 0;
      return acc;
    }, { planned_materials: 0, planned_labour: 0, actual_materials: 0, actual_labour: 0 });
  };

  const totals = calculateTotals();

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

      {/* Detailed BOQ View Section */}
      <div className="bg-white rounded-lg shadow-md border border-gray-300 overflow-hidden">
        <div className="bg-gray-800 px-6 py-4">
          <h3 className="text-lg font-bold text-white">Complete BOQ Details</h3>
          <p className="text-xs text-gray-300 mt-1">Full breakdown of all items with materials and labour</p>
        </div>

        <div className="p-6 max-h-[600px] overflow-y-auto">
          <div className="space-y-6">
            {data.items?.map((item: any, idx: number) => (
              <div key={idx} className="border-l-4 border-gray-400 pl-4">
                <h4 className="text-base font-bold text-gray-900 mb-3">{item.item_name}</h4>
                <p className="text-xs text-gray-500 mb-3">{item.description}</p>

                {/* Materials */}
                {item.materials?.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Materials:</p>
                    <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
                      {item.materials.map((mat: any, mIdx: number) => (
                        <div key={mIdx} className="flex justify-between items-center">
                          <span className="text-gray-700 flex items-center gap-2">
                            <span>
                              {mat.material_name}
                              {mat.sub_item_name && (
                                <span className="text-xs text-gray-500 ml-2">
                                  [{mat.sub_item_name}]
                                </span>
                              )}
                              {mat.planned && mat.planned.total > 0 && (
                                <span className="text-xs text-gray-500 ml-2">
                                  ({mat.planned.quantity} {mat.planned.unit} @ {formatCurrency(mat.planned.unit_price)}/{mat.planned.unit})
                                </span>
                              )}
                              {mat.is_from_change_request && mat.actual && (
                                <span className="text-xs text-gray-500 ml-2">
                                  ({mat.actual.quantity} {mat.actual.unit} @ {formatCurrency(mat.actual.unit_price)}/{mat.actual.unit})
                                </span>
                              )}
                              {!mat.planned && !mat.is_from_change_request && (
                                <span className="text-xs text-orange-600 ml-2 font-semibold">
                                  (Unplanned)
                                </span>
                              )}
                            </span>
                            {mat.is_from_change_request && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                                NEW - CR #{mat.change_request_id}
                              </span>
                            )}
                          </span>
                          <span className="font-medium text-gray-900">
                            {mat.is_from_change_request || (mat.actual && mat.actual.total > 0)
                              ? formatCurrency(mat.actual?.total || 0)
                              : formatCurrency(mat.planned?.total || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Labour */}
                {item.labour?.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Labour:</p>
                    <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
                      {item.labour.map((lab: any, lIdx: number) => (
                        <div key={lIdx} className="flex justify-between items-center">
                          <span className="text-gray-700">
                            {lab.labour_role}
                            <span className="text-xs text-gray-500 ml-2">
                              ({lab.planned.hours} hrs @ {formatCurrency(lab.planned.rate_per_hour)}/hr)
                            </span>
                          </span>
                          <span className="font-medium text-gray-900">{formatCurrency(lab.planned.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Financial Summary */}
                <div className="bg-blue-50 rounded p-3 text-sm border border-blue-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Base Cost:</span>
                      <span className="font-semibold">{formatCurrency(item.planned.base_cost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Miscellaneous ({item.planned.overhead_percentage}%):</span>
                      <span className="font-semibold">{formatCurrency(item.planned.overhead_amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Overhead & Profit ({item.planned.profit_percentage}%):</span>
                      <span className="font-semibold">{formatCurrency(item.planned.profit_amount)}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span className="text-gray-900">Total:</span>
                      <span className="text-blue-700">{formatCurrency(item.planned.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Each Item Comparison Section */}
      {data.items?.map((item: any, index: number) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-white rounded-lg shadow-md border border-gray-300 overflow-hidden"
        >
          {/* Item Header */}
          <div className="bg-gray-50 px-6 py-4 border-b-2 border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">{item.item_name}</h3>
              <button
                onClick={() => openBreakdownModal(item)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold rounded transition-colors flex items-center gap-2"
              >
                <Calculator className="w-4 h-4" />
                View Details
              </button>
            </div>
          </div>

          {/* Side-by-Side Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-x divide-gray-200">
            {/* LEFT SIDE - PLANNED */}
            <div className="p-6 bg-gray-50">
              <div className="mb-6">
                <h4 className="text-lg font-bold text-gray-900 mb-1">Planned Budget</h4>
                <p className="text-xs text-gray-500">Original estimate</p>
              </div>

              {/* Sub Items */}
              {item.materials.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3">Sub Items</h5>
                  <div className="bg-white rounded border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-2 px-3 text-gray-700 font-semibold">Material</th>
                          <th className="text-right py-2 px-3 text-gray-700 font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.materials
                          .filter((mat: any) => mat.planned && mat.source !== 'change_request')
                          .map((mat: any, mIdx: number) => (
                          <tr key={mIdx} className="border-t border-gray-100">
                            <td className="py-2 px-3 text-gray-700">
                              <div className="flex flex-col">
                                <span>{mat.material_name}</span>
                                {mat.sub_item_name && (
                                  <span className="text-xs text-gray-500">[{mat.sub_item_name}]</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-medium text-gray-900">
                              {formatCurrency(mat.planned.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Labour */}
              {item.labour.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3">Labour</h5>
                  <div className="bg-white rounded border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-2 px-3 text-gray-700 font-semibold">Role</th>
                          <th className="text-right py-2 px-3 text-gray-700 font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.labour.map((lab: any, lIdx: number) => (
                          <tr key={lIdx} className="border-t border-gray-100">
                            <td className="py-2 px-3 text-gray-700">{lab.labour_role}</td>
                            <td className="py-2 px-3 text-right font-medium text-gray-900">
                              {formatCurrency(lab.planned.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Financial Breakdown */}
              <div className="bg-white rounded border border-gray-300 p-4">
                <h5 className="text-sm font-semibold text-gray-700 mb-3">Cost Breakdown</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Sub Items Total:</span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.planned.materials_total)}</span>
                  </div>
                  <div className="flex justify-between py-1 pb-2">
                    <span className="text-gray-600">Labour Total:</span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.planned.labour_total)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-gray-300 font-semibold">
                    <span className="text-gray-700">Base Cost:</span>
                    <span className="text-gray-900">{formatCurrency(item.planned.base_cost)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="text-lg">+</span> Miscellaneous ({item.planned.overhead_percentage}%):
                    </span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.planned.overhead_amount)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="text-lg">+</span> Overhead & Profit ({item.planned.profit_percentage}%):
                    </span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.planned.profit_amount)}</span>
                  </div>
                  <div className="flex justify-between py-1 pb-2 text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="text-lg">+</span> Transport:
                    </span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.planned.transport_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between py-3 border-t-2 border-gray-400 bg-gray-50 -mx-4 px-4">
                    <span className="font-bold text-gray-900 flex items-center gap-1">
                      <span className="text-lg">=</span> Total Planned:
                    </span>
                    <span className="font-bold text-gray-900 text-lg">{formatCurrency(item.planned.total)}</span>
                  </div>
                </div>
              </div>

              {/* Discount Details */}
              {item.discount_details?.has_discount && (
                <div className="bg-orange-50 rounded border border-orange-300 p-4 mt-4">
                  <h5 className="text-sm font-semibold text-orange-800 mb-3">Discount Details</h5>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1">
                      <span className="text-gray-700">Client Cost (Before Discount):</span>
                      <span className="font-medium text-gray-900">{formatCurrency(item.discount_details.client_cost_before_discount)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-orange-700">
                      <span className="flex items-center gap-1">
                        <span className="text-lg">-</span> Discount ({item.discount_details.discount_percentage.toFixed(2)}%):
                      </span>
                      <span className="font-medium">-{formatCurrency(item.discount_details.discount_amount)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-t-2 border-orange-400 font-semibold">
                      <span className="text-gray-900">Grand Total (After Discount):</span>
                      <span className="text-green-700">{formatCurrency(item.discount_details.grand_total_after_discount)}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-orange-300">
                      <p className="text-xs font-semibold text-orange-800 mb-2">Profit Impact:</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600">Profit Before Discount:</span>
                          <span className="font-medium text-gray-900">{formatCurrency(item.discount_details.profit_impact.profit_before_discount)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600">Profit After Discount:</span>
                          <span className="font-medium text-green-700">{formatCurrency(item.discount_details.profit_impact.profit_after_discount)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-red-700 font-semibold">
                          <span>Profit Reduction:</span>
                          <span>-{formatCurrency(item.discount_details.profit_impact.profit_reduction)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT SIDE - ACTUAL */}
            <div className="p-6 bg-white">
              <div className="mb-6">
                <h4 className="text-lg font-bold text-gray-900 mb-1">Actual Spending</h4>
                <p className="text-xs text-gray-500">Real costs incurred</p>
              </div>

              {/* Sub Items */}
              {item.materials.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3">Sub Items</h5>
                  <div className="bg-white rounded border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-2 px-3 text-gray-700 font-semibold">Material</th>
                          <th className="text-right py-2 px-3 text-gray-700 font-semibold">Amount</th>
                          <th className="text-left py-2 px-3 text-gray-700 font-semibold text-xs">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.materials.map((mat: any, mIdx: number) => (
                          <tr key={mIdx} className={`border-t border-gray-100 ${
                            mat.status === 'unplanned' ? 'bg-yellow-50' : ''
                          }`}>
                            <td className="py-2 px-3">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-700">{mat.material_name}</span>
                                  {mat.is_from_change_request ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                                      NEW - CR #{mat.change_request_id}
                                    </span>
                                  ) : mat.status === 'unplanned' && (
                                    <span className="px-1.5 py-0.5 text-xs bg-orange-500 text-white rounded font-semibold">
                                      NEW
                                    </span>
                                  )}
                                </div>
                                {mat.sub_item_name && (
                                  <span className="text-xs text-gray-500">[{mat.sub_item_name}]</span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className={`font-medium ${
                                mat.variance?.status === 'overrun' ? 'text-red-600' :
                                mat.variance?.status === 'saved' ? 'text-green-600' :
                                'text-gray-900'
                              }`}>
                                {mat.actual ? formatCurrency(mat.actual.total) :
                                 mat.planned ? formatCurrency(mat.planned.total) : '-'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-xs text-gray-500 italic">
                              {mat.variance_reason || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Labour */}
              {item.labour.length > 0 && (
                <div className="mb-6">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3">Labour</h5>
                  <div className="bg-white rounded border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-2 px-3 text-gray-700 font-semibold">Role</th>
                          <th className="text-right py-2 px-3 text-gray-700 font-semibold">Amount</th>
                          <th className="text-left py-2 px-3 text-gray-700 font-semibold text-xs">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.labour.map((lab: any, lIdx: number) => (
                          <tr key={lIdx} className="border-t border-gray-100">
                            <td className="py-2 px-3 text-gray-700">{lab.labour_role}</td>
                            <td className="py-2 px-3 text-right">
                              <span className={`font-medium ${
                                lab.variance?.status === 'overrun' ? 'text-red-600' :
                                lab.variance?.status === 'saved' ? 'text-green-600' :
                                'text-gray-900'
                              }`}>
                                {lab.actual ? formatCurrency(lab.actual.total) : formatCurrency(lab.planned.total)}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-xs text-gray-500 italic">-</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Financial Breakdown */}
              <div className="bg-white rounded border border-gray-300 p-4">
                <h5 className="text-sm font-semibold text-gray-700 mb-3">Cost Breakdown</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Sub Items Total:</span>
                    <span className={`font-medium ${
                      item.actual.materials_total > item.planned.materials_total ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {formatCurrency(item.actual.materials_total)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 pb-2">
                    <span className="text-gray-600">Labour Total:</span>
                    <span className={`font-medium ${
                      item.actual.labour_total > item.planned.labour_total ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {formatCurrency(item.actual.labour_total)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-gray-300 font-semibold">
                    <span className="text-gray-700">Base Cost:</span>
                    <span className={
                      item.actual.base_cost > item.planned.base_cost ? 'text-red-600' : 'text-gray-900'
                    }>
                      {formatCurrency(item.actual.base_cost)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="text-lg">+</span> Miscellaneous Consumed:
                    </span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.actual.overhead_amount)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="text-lg">+</span> Overhead & Profit/Loss:
                    </span>
                    <span className={`font-medium ${
                      item.actual.profit_amount < 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {formatCurrency(item.actual.profit_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 pb-2 text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="text-lg">+</span> Transport:
                    </span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.actual.transport_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between py-3 border-t-2 border-gray-400 bg-gray-50 -mx-4 px-4">
                    <span className="font-bold text-gray-900 flex items-center gap-1">
                      <span className="text-lg">=</span> Total Actual:
                    </span>
                    <span className={`font-bold text-lg ${
                      item.actual.total > item.planned.total ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {formatCurrency(item.actual.total)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Discount Details - Actual */}
              {item.discount_details?.has_discount && (
                <div className="bg-green-50 rounded border border-green-300 p-4 mt-4">
                  <h5 className="text-sm font-semibold text-green-800 mb-3">Discount Applied</h5>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1">
                      <span className="text-gray-700">Client Amount (Before Discount):</span>
                      <span className="font-medium text-gray-900">{formatCurrency(item.discount_details.client_cost_before_discount)}</span>
                    </div>
                    <div className="flex justify-between py-1 text-green-700">
                      <span className="flex items-center gap-1">
                        <span className="text-lg">-</span> Discount Applied ({item.discount_details.discount_percentage.toFixed(2)}%):
                      </span>
                      <span className="font-medium">-{formatCurrency(item.discount_details.discount_amount)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-t-2 border-green-400 font-semibold">
                      <span className="text-gray-900">Client Pays (After Discount):</span>
                      <span className="text-green-700">{formatCurrency(item.discount_details.grand_total_after_discount)}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-green-300">
                      <p className="text-xs font-semibold text-green-800 mb-2">Actual Profit Impact:</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600">Profit Before Discount:</span>
                          <span className="font-medium text-gray-900">{formatCurrency(item.actual.profit_before_discount || 0)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600">Actual Profit (After Discount):</span>
                          <span className={`font-medium ${item.actual.actual_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatCurrency(item.actual.actual_profit || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </motion.div>
      ))}

      {/* Overall Summary Section */}
      {data.summary && (
        <div className="space-y-6 mt-8">
          {/* Summary Header */}
          <div className="bg-gray-100 rounded-lg p-6 border-2 border-gray-300">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Overall Project Summary</h3>
            <p className="text-sm text-gray-600">Complete financial breakdown across all items</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Planned Summary */}
            <div className="bg-white rounded-lg border border-gray-300 shadow-md overflow-hidden">
              <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                <h4 className="text-base font-bold text-gray-900">Total Planned Budget</h4>
              </div>
              <div className="p-6 space-y-2 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Sub Items Total:</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(totals.planned_materials)}
                  </span>
                </div>
                <div className="flex justify-between py-1 pb-2">
                  <span className="text-gray-600">Labour Total:</span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(totals.planned_labour)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-t-2 border-gray-300 font-semibold">
                  <span className="text-gray-700">Base Cost:</span>
                  <span className="text-gray-900">
                    {formatCurrency(totals.planned_materials + totals.planned_labour)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="text-lg">+</span> Miscellaneous:
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data.summary.total_planned_overhead || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="text-lg">+</span> Overhead & Profit:
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data.summary.total_planned_profit || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-1 pb-2 text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="text-lg">+</span> Transport:
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data.summary.total_planned_transport || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-3 border-t-2 border-gray-400 bg-gray-50 -mx-6 px-6">
                  <span className="font-bold text-gray-900 flex items-center gap-1">
                    <span className="text-lg">=</span> Total Planned:
                  </span>
                  <span className="font-bold text-gray-900 text-lg">
                    {formatCurrency(data.summary.planned_total)}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Actual Summary */}
            <div className="bg-white rounded-lg border border-gray-300 shadow-md overflow-hidden">
              <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                <h4 className="text-base font-bold text-gray-900">Total Actual Spending</h4>
              </div>
              <div className="p-6 space-y-2 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Sub Items Total:</span>
                  <span className={`font-medium ${
                    totals.actual_materials > totals.planned_materials
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {formatCurrency(totals.actual_materials)}
                  </span>
                </div>
                <div className="flex justify-between py-1 pb-2">
                  <span className="text-gray-600">Labour Total:</span>
                  <span className={`font-medium ${
                    totals.actual_labour > totals.planned_labour
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {formatCurrency(totals.actual_labour)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-t-2 border-gray-300 font-semibold">
                  <span className="text-gray-700">Base Cost:</span>
                  <span className={`${
                    (totals.actual_materials + totals.actual_labour) >
                    (totals.planned_materials + totals.planned_labour)
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {formatCurrency(totals.actual_materials + totals.actual_labour)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="text-lg">+</span> Miscellaneous:
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data.summary.total_actual_overhead || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="text-lg">+</span> Overhead & Profit/Loss:
                  </span>
                  <span className={`font-medium ${
                    (data.summary.total_actual_profit || 0) < 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {formatCurrency(data.summary.total_actual_profit || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-1 pb-2 text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="text-lg">+</span> Transport:
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatCurrency(data.summary.total_actual_transport || 0)}
                  </span>
                </div>
                <div className="flex justify-between py-3 border-t-2 border-gray-400 bg-gray-50 -mx-6 px-6">
                  <span className="font-bold text-gray-900 flex items-center gap-1">
                    <span className="text-lg">=</span> Total Actual:
                  </span>
                  <span className={`font-bold text-lg ${
                    data.summary.actual_total > data.summary.planned_total
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {formatCurrency(data.summary.actual_total)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Discount Summary */}
          {data.summary?.discount_details?.has_discount && (
            <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg border-2 border-orange-300 shadow-md overflow-hidden">
              <div className="bg-gradient-to-r from-orange-100 to-yellow-100 px-6 py-3 border-b-2 border-orange-300">
                <h4 className="text-base font-bold text-orange-900">Discount Applied to Project</h4>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white rounded-lg border border-orange-200 p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">Client Cost (Before Discount)</p>
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(data.summary.discount_details.client_cost_before_discount)}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-orange-200 p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">Discount Applied</p>
                    <p className="text-2xl font-bold text-orange-600">
                      -{formatCurrency(data.summary.discount_details.discount_amount)}
                      <span className="text-sm ml-2">({data.summary.discount_details.discount_percentage.toFixed(2)}%)</span>
                    </p>
                  </div>
                  <div className="bg-white rounded-lg border border-green-300 p-4">
                    <p className="text-xs font-semibold text-gray-600 mb-2 uppercase">Client Pays (After Discount)</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.discount_details.grand_total_after_discount)}</p>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t-2 border-orange-300">
                  <h5 className="text-sm font-bold text-orange-900 mb-4">Profit Impact from Discount</h5>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
                      <p className="text-xs text-gray-600 mb-1">Profit Before Discount:</p>
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(data.summary.discount_details.profit_impact.profit_before_discount)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg border border-green-200 p-3">
                      <p className="text-xs text-gray-600 mb-1">Profit After Discount:</p>
                      <p className={`text-lg font-bold ${data.summary.discount_details.profit_impact.profit_after_discount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(data.summary.discount_details.profit_impact.profit_after_discount)}
                      </p>
                    </div>
                    <div className="bg-red-50 rounded-lg border border-red-200 p-3">
                      <p className="text-xs text-gray-600 mb-1">Profit Reduction:</p>
                      <p className="text-lg font-bold text-red-600">-{formatCurrency(data.summary.discount_details.profit_impact.profit_reduction)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Variance Summary */}
          <div className="bg-white rounded-lg border border-gray-300 shadow-md overflow-hidden">
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
              <h4 className="text-base font-bold text-gray-900">Overall Variance</h4>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                  <p className="text-xs text-gray-600 mb-1">Miscellaneous Variance:</p>
                  <p className={`text-lg font-bold ${
                    (data.summary.total_actual_overhead || 0) - (data.summary.total_planned_overhead || 0) < 0
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(Math.abs((data.summary.total_actual_overhead || 0) - (data.summary.total_planned_overhead || 0)))}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Transport Variance:</p>
                  <p className={`text-lg font-bold ${
                    (data.summary.total_actual_transport || 0) - (data.summary.total_planned_transport || 0) !== 0
                      ? 'text-orange-600'
                      : 'text-green-600'
                  }`}>
                    {formatCurrency(Math.abs((data.summary.total_actual_transport || 0) - (data.summary.total_planned_transport || 0)))}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-600 mb-1">Overhead & Profit/Loss Variance:</p>
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
              <div className={`mt-6 rounded-lg border-2 p-6 ${
                (data.summary.total_actual_profit || 0) >= 0
                  ? 'bg-green-50 border-green-400'
                  : 'bg-red-50 border-red-400'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-2xl ${
                      (data.summary.total_actual_profit || 0) >= 0 ? 'bg-green-600' : 'bg-red-600'
                    }`}>
                      {(data.summary.total_actual_profit || 0) >= 0 ? '✓' : '✗'}
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 font-semibold uppercase mb-1">Final Project Status</p>
                      <p className={`text-2xl font-bold ${
                        (data.summary.total_actual_profit || 0) >= 0 ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {(data.summary.total_actual_profit || 0) >= 0 ? 'Profit Maintained' : 'Loss Incurred'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-600 font-semibold mb-1 uppercase">
                      {data.summary.status === 'on_budget' ? 'ON BUDGET' : data.summary.status === 'under_budget' ? 'UNDER BUDGET' : 'OVER BUDGET'}
                    </p>
                    <p className={`text-3xl font-bold ${
                      (data.summary.total_actual_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      AED{(data.summary.total_actual_profit || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
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
                    <span>Miscellaneous ({selectedItemForBreakdown.planned.overhead_percentage}%):</span>
                    <span className="font-semibold">{formatCurrency(selectedItemForBreakdown.planned.overhead_amount)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-t-2 border-blue-300 pt-2 font-semibold">
                    <span>Total Cost:</span>
                    <span>{formatCurrency(selectedItemForBreakdown.planned.total)}</span>
                  </div>
                  <div className="flex justify-between py-2 bg-green-100 rounded px-2 border border-green-300 mt-2">
                    <span className="text-green-900 font-bold">Planned Overhead & Profit ({selectedItemForBreakdown.planned.profit_percentage}%):</span>
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
                    <span>Miscellaneous (10% on actual base):</span>
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
                        ? `Actual Overhead & Profit (${selectedItemForBreakdown.actual.profit_percentage?.toFixed(2)}%):`
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
