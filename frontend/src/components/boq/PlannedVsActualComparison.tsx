import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircleIcon,
  XCircleIcon,
  ChartBarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '@/api/config';
import { toast } from 'sonner';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface PlannedVsActualProps {
  boqId: number;
  projectId: number;
}

const PlannedVsActualComparison: React.FC<PlannedVsActualProps> = ({ boqId, projectId }) => {
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<number | null>(null);

  useEffect(() => {
    loadComparison();
  }, [boqId]);

  const loadComparison = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/boq-tracking/planned-vs-actual/${boqId}`);
      setComparison(response.data);
    } catch (error: any) {
      console.error('Error loading comparison:', error);
      toast.error('Failed to load comparison data');
    } finally {
      setLoading(false);
    }
  };

  const getVarianceColor = (variance: number) => {
    if (variance < 0) return 'text-green-600';
    if (variance > 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getVarianceIcon = (variance: number) => {
    if (variance < 0) return <ArrowDownIcon className="w-4 h-4 text-green-600" />;
    if (variance > 0) return <ArrowUpIcon className="w-4 h-4 text-red-600" />;
    return null;
  };

  const formatCurrency = (amount: number) => {
    return `AED ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <ModernLoadingSpinners />
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No comparison data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 shadow-lg"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Overall Summary</h2>
          <div className={`px-4 py-2 rounded-lg font-semibold ${
            comparison.summary.status === 'under_budget'
              ? 'bg-green-100 text-green-700'
              : comparison.summary.status === 'over_budget'
              ? 'bg-red-100 text-red-700'
              : 'bg-gray-100 text-gray-700'
          }`}>
            {comparison.summary.status === 'under_budget' && '✅ Under Budget'}
            {comparison.summary.status === 'over_budget' && '❌ Over Budget'}
            {comparison.summary.status === 'on_budget' && '✓ On Budget'}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Revenue Cost</p>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(comparison.summary.planned_total)}
            </p>
          </div>

          <div className="bg-white rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Actual Total Cost</p>
            <p className="text-2xl font-bold text-purple-600">
              {formatCurrency(comparison.summary.actual_total)}
            </p>
          </div>

          <div className="bg-white rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Variance</p>
            <div className="flex items-center gap-2">
              {getVarianceIcon(comparison.summary.variance)}
              <p className={`text-2xl font-bold ${getVarianceColor(comparison.summary.variance)}`}>
                {comparison.summary.variance < 0 ? '-' : '+'}
                {formatCurrency(Math.abs(comparison.summary.variance))}
              </p>
            </div>
            <p className={`text-sm ${getVarianceColor(comparison.summary.variance)}`}>
              ({comparison.summary.variance_percentage.toFixed(2)}%)
            </p>
          </div>
        </div>
      </motion.div>

      {/* Items Comparison */}
      <div className="space-y-4">
        {comparison.items.map((item: any, idx: number) => (
          <motion.div
            key={item.master_item_id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white rounded-xl shadow-md overflow-hidden"
          >
            {/* Item Header */}
            <div
              className="bg-gradient-to-r from-gray-50 to-gray-100 p-4 cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-colors"
              onClick={() => setSelectedItem(selectedItem === idx ? null : idx)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{item.item_name}</h3>
                  <p className="text-sm text-gray-600">{item.description}</p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Variance</p>
                    <p className={`text-lg font-bold ${getVarianceColor(item.variance.total)}`}>
                      {item.variance.total < 0 ? '-' : '+'}
                      {formatCurrency(Math.abs(item.variance.total))}
                    </p>
                  </div>

                  <ChartBarIcon className="w-6 h-6 text-gray-400" />
                </div>
              </div>
            </div>

            {/* Expanded Details */}
            {selectedItem === idx && (
              <div className="p-6 space-y-6">
                {/* Materials Comparison */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    📦 Materials Comparison
                  </h4>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-3 font-semibold">Material</th>
                          <th className="text-right p-3 font-semibold">Planned Qty</th>
                          <th className="text-right p-3 font-semibold">Actual Qty</th>
                          <th className="text-right p-3 font-semibold">Planned Cost</th>
                          <th className="text-right p-3 font-semibold">Actual Cost</th>
                          <th className="text-right p-3 font-semibold">Variance</th>
                          <th className="text-center p-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {item.materials.map((mat: any, matIdx: number) => (
                          <tr key={matIdx} className="hover:bg-gray-50">
                            <td className="p-3 font-medium">{mat.material_name}</td>
                            <td className="text-right p-3">
                              {mat.planned.quantity} {mat.planned.unit}
                            </td>
                            <td className="text-right p-3">
                              {mat.actual?.quantity || 0} {mat.actual?.unit || mat.planned.unit}
                            </td>
                            <td className="text-right p-3">{formatCurrency(mat.planned.total)}</td>
                            <td className="text-right p-3">
                              {mat.actual ? formatCurrency(mat.actual.total) : '-'}
                            </td>
                            <td className={`text-right p-3 font-semibold ${mat.variance ? getVarianceColor(mat.variance.total) : ''}`}>
                              {mat.variance ? (
                                <>
                                  {mat.variance.total < 0 ? '-' : '+'}
                                  {formatCurrency(Math.abs(mat.variance.total))}
                                </>
                              ) : '-'}
                            </td>
                            <td className="text-center p-3">
                              {mat.status === 'recorded' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                                  <CheckCircleIcon className="w-4 h-4" />
                                  Recorded
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                                  <ClockIcon className="w-4 h-4" />
                                  Pending
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Labour Comparison */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    👷 Labour Comparison
                  </h4>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-3 font-semibold">Role</th>
                          <th className="text-right p-3 font-semibold">Planned Hrs</th>
                          <th className="text-right p-3 font-semibold">Actual Hrs</th>
                          <th className="text-right p-3 font-semibold">Planned Cost</th>
                          <th className="text-right p-3 font-semibold">Actual Cost</th>
                          <th className="text-right p-3 font-semibold">Variance</th>
                          <th className="text-center p-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {item.labour.map((lab: any, labIdx: number) => (
                          <tr key={labIdx} className="hover:bg-gray-50">
                            <td className="p-3 font-medium">{lab.labour_role}</td>
                            <td className="text-right p-3">{lab.planned.hours} hrs</td>
                            <td className="text-right p-3">
                              {lab.actual?.hours || 0} hrs
                            </td>
                            <td className="text-right p-3">{formatCurrency(lab.planned.total)}</td>
                            <td className="text-right p-3">
                              {lab.actual ? formatCurrency(lab.actual.total) : '-'}
                            </td>
                            <td className={`text-right p-3 font-semibold ${lab.variance ? getVarianceColor(lab.variance.total) : ''}`}>
                              {lab.variance ? (
                                <>
                                  {lab.variance.total < 0 ? '-' : '+'}
                                  {formatCurrency(Math.abs(lab.variance.total))}
                                </>
                              ) : '-'}
                            </td>
                            <td className="text-center p-3">
                              {lab.status === 'recorded' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                                  <CheckCircleIcon className="w-4 h-4" />
                                  Recorded
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                                  <ClockIcon className="w-4 h-4" />
                                  Pending
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cost Breakdown */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4">
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">💰 Cost Breakdown</h4>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600 font-medium mb-2">Planned</p>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span>Materials:</span>
                          <span className="font-semibold">{formatCurrency(item.planned.materials_total)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Labour:</span>
                          <span className="font-semibold">{formatCurrency(item.planned.labour_total)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1">
                          <span>Base Cost:</span>
                          <span className="font-semibold">{formatCurrency(item.planned.base_cost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Overhead ({item.planned.overhead_percentage}%):</span>
                          <span className="font-semibold">{formatCurrency(item.planned.overhead)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Profit ({item.planned.profit_percentage}%):</span>
                          <span className="font-semibold">{formatCurrency(item.planned.profit)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1 font-bold text-base">
                          <span>Total:</span>
                          <span className="text-blue-600">{formatCurrency(item.planned.total)}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-gray-600 font-medium mb-2">Actual</p>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span>Materials:</span>
                          <span className="font-semibold">{formatCurrency(item.actual.materials_total)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Labour:</span>
                          <span className="font-semibold">{formatCurrency(item.actual.labour_total)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1">
                          <span>Base Cost:</span>
                          <span className="font-semibold">{formatCurrency(item.actual.base_cost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Overhead ({item.actual.overhead_percentage}%):</span>
                          <span className="font-semibold">{formatCurrency(item.actual.overhead)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Profit ({item.actual.profit_percentage}%):</span>
                          <span className="font-semibold">{formatCurrency(item.actual.profit)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1 font-bold text-base">
                          <span>Total:</span>
                          <span className="text-purple-600">{formatCurrency(item.actual.total)}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-gray-600 font-medium mb-2">Variance</p>
                      <div className="space-y-1">
                        <div className={`flex justify-between ${getVarianceColor(item.variance.materials)}`}>
                          <span>Materials:</span>
                          <span className="font-semibold">
                            {item.variance.materials < 0 ? '-' : '+'}
                            {formatCurrency(Math.abs(item.variance.materials))}
                          </span>
                        </div>
                        <div className={`flex justify-between ${getVarianceColor(item.variance.labour)}`}>
                          <span>Labour:</span>
                          <span className="font-semibold">
                            {item.variance.labour < 0 ? '-' : '+'}
                            {formatCurrency(Math.abs(item.variance.labour))}
                          </span>
                        </div>
                        <div className={`flex justify-between border-t pt-1 ${getVarianceColor(item.variance.base_cost)}`}>
                          <span>Base Cost:</span>
                          <span className="font-semibold">
                            {item.variance.base_cost < 0 ? '-' : '+'}
                            {formatCurrency(Math.abs(item.variance.base_cost))}
                          </span>
                        </div>
                        <div className={`flex justify-between ${getVarianceColor(item.variance.overhead)}`}>
                          <span>Overhead:</span>
                          <span className="font-semibold">
                            {item.variance.overhead < 0 ? '-' : '+'}
                            {formatCurrency(Math.abs(item.variance.overhead))}
                          </span>
                        </div>
                        <div className={`flex justify-between ${getVarianceColor(item.variance.profit)}`}>
                          <span>Profit:</span>
                          <span className="font-semibold">
                            {item.variance.profit < 0 ? '-' : '+'}
                            {formatCurrency(Math.abs(item.variance.profit))}
                          </span>
                        </div>
                        <div className={`flex justify-between border-t pt-1 font-bold text-base ${getVarianceColor(item.variance.total)}`}>
                          <span>Total:</span>
                          <span>
                            {item.variance.total < 0 ? '-' : '+'}
                            {formatCurrency(Math.abs(item.variance.total))}
                          </span>
                        </div>
                        <div className={`text-xs text-center ${getVarianceColor(item.variance.total)}`}>
                          ({item.variance.percentage.toFixed(2)}%)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default PlannedVsActualComparison;
