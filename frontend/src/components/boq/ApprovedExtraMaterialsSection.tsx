import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Package, Calendar } from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/formatters';

interface ApprovedMaterial {
  id: number;
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  change_request_id?: number;
  related_item?: string;
  approval_date?: string;
  approved_by_name?: string;
}

interface ApprovedExtraMaterialsSectionProps {
  materials: ApprovedMaterial[];
  onViewChangeRequest?: (crId: number) => void;
}

const ApprovedExtraMaterialsSection: React.FC<ApprovedExtraMaterialsSectionProps> = ({
  materials,
  onViewChangeRequest
}) => {
  if (materials.length === 0) return null;

  const totalCost = materials.reduce((sum, material) => sum + material.total_price, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="mb-8"
    >
      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-t-lg px-4 py-3 flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          Approved Material Purchases
        </h3>
        <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium text-white">
          {materials.length} item{materials.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="border-2 border-green-200 rounded-b-lg p-4 bg-green-50/30">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Material
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Related BOQ Item
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unit Price
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {materials.map((material, index) => (
                <tr key={material.id || index} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{material.item_name}</div>
                        {material.change_request_id && onViewChangeRequest && (
                          <button
                            onClick={() => onViewChangeRequest(material.change_request_id!)}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-0.5"
                          >
                            CR-{material.change_request_id}
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {material.related_item ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {material.related_item}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">
                    {material.quantity} {material.unit}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">
                    {formatCurrency(material.unit_price)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                    {formatCurrency(material.total_price)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        APPROVED
                      </span>
                      {material.approval_date && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {formatDate(material.approval_date)}
                        </div>
                      )}
                      {material.approved_by_name && (
                        <div className="text-xs text-gray-500">
                          by {material.approved_by_name}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                  Total Material Purchase Cost:
                </td>
                <td className="px-4 py-3 text-right text-lg font-bold text-green-600">
                  {formatCurrency(totalCost)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Summary Info */}
        <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-green-600">{materials.length}</span> extra material{materials.length > 1 ? 's have' : ' has'} been approved and merged into this BOQ.
            {materials.some(m => m.change_request_id) && ' Click on CR numbers to view full change request details.'}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default ApprovedExtraMaterialsSection;
