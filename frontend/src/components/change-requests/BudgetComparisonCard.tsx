import React from 'react';
import { motion } from 'framer-motion';
import { BudgetImpact } from '@/types/changeRequest';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

interface BudgetComparisonCardProps {
  budgetImpact: BudgetImpact;
}

const BudgetComparisonCard: React.FC<BudgetComparisonCardProps> = ({ budgetImpact }) => {
  const formatCurrency = (value: number) => {
    return `AED ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getPercentageColor = (percentage: number) => {
    if (percentage <= 5) return 'text-green-600';
    if (percentage <= 15) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPercentageBgColor = (percentage: number) => {
    if (percentage <= 5) return 'bg-green-100';
    if (percentage <= 15) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl border-2 border-blue-200 shadow-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <ChartBarIcon className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">Budget Impact Analysis</h3>
          <p className="text-sm text-gray-600">Original BOQ vs With New Request</p>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto mb-6">
        <table className="w-full">
          <thead>
            <tr className="bg-gradient-to-r from-blue-50 to-blue-100 border-b-2 border-blue-300">
              <th className="text-left py-3 px-4 font-semibold text-gray-900">Cost Item</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-900">Original BOQ</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-900">With New Request</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-900">Change</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {/* Material Cost */}
            <tr className="border-b border-gray-200 hover:bg-blue-50/30">
              <td className="py-3 px-4 text-gray-700">Material Cost</td>
              <td className="py-3 px-4 text-right font-medium text-gray-900">
                {formatCurrency(budgetImpact.original_material_cost)}
              </td>
              <td className="py-3 px-4 text-right font-medium text-blue-700">
                {formatCurrency(budgetImpact.new_material_cost)}
              </td>
              <td className="py-3 px-4 text-right font-semibold text-blue-700">
                +{formatCurrency(budgetImpact.new_material_cost - budgetImpact.original_material_cost)}
              </td>
            </tr>

            {/* Labour Cost */}
            <tr className="border-b border-gray-200 hover:bg-blue-50/30">
              <td className="py-3 px-4 text-gray-700">Labour Cost</td>
              <td className="py-3 px-4 text-right font-medium text-gray-900">
                {formatCurrency(budgetImpact.original_labour_cost)}
              </td>
              <td className="py-3 px-4 text-right font-medium text-blue-700">
                {formatCurrency(budgetImpact.new_labour_cost)}
              </td>
              <td className="py-3 px-4 text-right font-semibold text-blue-700">
                +{formatCurrency(budgetImpact.new_labour_cost - budgetImpact.original_labour_cost)}
              </td>
            </tr>

            {/* Base Cost */}
            <tr className="border-b border-gray-200 hover:bg-blue-50/30 bg-gray-50">
              <td className="py-3 px-4 text-gray-900 font-medium">Base Cost</td>
              <td className="py-3 px-4 text-right font-semibold text-gray-900">
                {formatCurrency(budgetImpact.original_base_cost)}
              </td>
              <td className="py-3 px-4 text-right font-semibold text-blue-700">
                {formatCurrency(budgetImpact.new_base_cost)}
              </td>
              <td className="py-3 px-4 text-right font-bold text-blue-700">
                +{formatCurrency(budgetImpact.new_base_cost - budgetImpact.original_base_cost)}
              </td>
            </tr>

            {/* Negotiable Profit (formerly Overhead) */}
            <tr className="border-b border-gray-200 hover:bg-blue-50/30">
              <td className="py-3 px-4 text-gray-700">Negotiable Profit</td>
              <td className="py-3 px-4 text-right font-medium text-gray-900">
                {formatCurrency(budgetImpact.original_overhead)}
              </td>
              <td className="py-3 px-4 text-right font-medium text-blue-700">
                {formatCurrency(budgetImpact.new_overhead)}
              </td>
              <td className="py-3 px-4 text-right font-semibold text-blue-700">
                +{formatCurrency(budgetImpact.new_overhead - budgetImpact.original_overhead)}
              </td>
            </tr>

            {/* Profit */}
            <tr className="border-b border-gray-200 hover:bg-blue-50/30">
              <td className="py-3 px-4 text-gray-700">Profit Margin</td>
              <td className="py-3 px-4 text-right font-medium text-gray-900">
                {formatCurrency(budgetImpact.original_profit)}
              </td>
              <td className="py-3 px-4 text-right font-medium text-green-700">
                {formatCurrency(budgetImpact.new_profit)}
              </td>
              <td className="py-3 px-4 text-right font-semibold text-green-700">
                +{formatCurrency(budgetImpact.additional_profit)}
              </td>
            </tr>

            {/* Total Cost */}
            <tr className="bg-gradient-to-r from-green-50 to-green-100 border-t-2 border-green-300">
              <td className="py-4 px-4 text-gray-900 font-bold text-base">Total Cost</td>
              <td className="py-4 px-4 text-right font-bold text-gray-900 text-base">
                {formatCurrency(budgetImpact.original_total_cost)}
              </td>
              <td className="py-4 px-4 text-right font-bold text-green-700 text-base">
                {formatCurrency(budgetImpact.new_total_cost)}
              </td>
              <td className="py-4 px-4 text-right font-bold text-green-700 text-base">
                +{formatCurrency(budgetImpact.additional_cost)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Additional Cost */}
        <div className={`${getPercentageBgColor(budgetImpact.cost_increase_percentage)} rounded-lg p-4 border-2 ${budgetImpact.cost_increase_percentage <= 5 ? 'border-green-300' : budgetImpact.cost_increase_percentage <= 15 ? 'border-yellow-300' : 'border-red-300'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Additional Cost</span>
            <ArrowTrendingUpIcon className={`w-5 h-5 ${getPercentageColor(budgetImpact.cost_increase_percentage)}`} />
          </div>
          <p className={`text-2xl font-bold ${getPercentageColor(budgetImpact.cost_increase_percentage)}`}>
            {formatCurrency(budgetImpact.additional_cost)}
          </p>
          <p className={`text-sm font-semibold mt-1 ${getPercentageColor(budgetImpact.cost_increase_percentage)}`}>
            +{budgetImpact.cost_increase_percentage.toFixed(2)}% increase
          </p>
        </div>

        {/* Additional Profit */}
        <div className="bg-green-100 rounded-lg p-4 border-2 border-green-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Additional Profit</span>
            <ArrowTrendingUpIcon className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-700">
            {formatCurrency(budgetImpact.additional_profit)}
          </p>
          <p className="text-sm font-medium text-green-600 mt-1">
            Profit increases
          </p>
        </div>

        {/* New Items */}
        <div className="bg-purple-100 rounded-lg p-4 border-2 border-purple-300">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">New Items</span>
            <ChartBarIcon className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-700">
            {budgetImpact.new_item_count}
          </p>
          <p className="text-sm font-medium text-purple-600 mt-1">
            Items to add
          </p>
        </div>
      </div>

      {/* Visual Progress Bar */}
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="mb-2">
          <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>Original Budget</span>
            <span>{formatCurrency(budgetImpact.original_total_cost)}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div className="bg-blue-500 h-3 rounded-full" style={{ width: '100%' }}></div>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
            <span>With New Request</span>
            <span>{formatCurrency(budgetImpact.new_total_cost)}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full ${budgetImpact.cost_increase_percentage <= 5 ? 'bg-green-500' : budgetImpact.cost_increase_percentage <= 15 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min((budgetImpact.new_total_cost / budgetImpact.original_total_cost) * 100, 150)}%` }}
            ></div>
          </div>
          <p className={`text-xs font-semibold mt-1 ${getPercentageColor(budgetImpact.cost_increase_percentage)}`}>
            {budgetImpact.cost_increase_percentage > 0 ? '+' : ''}{budgetImpact.cost_increase_percentage.toFixed(2)}% over original budget
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default BudgetComparisonCard;
