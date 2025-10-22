import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Package,
  Building2,
  MapPin,
  FileText,
  Calendar,
  User,
  CheckCircle,
  DollarSign,
  Hash
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/utils/formatters';
import { Purchase } from '../services/buyerService';

interface PurchaseDetailsModalProps {
  purchase: Purchase;
  isOpen: boolean;
  onClose: () => void;
}

const PurchaseDetailsModal: React.FC<PurchaseDetailsModalProps> = ({
  purchase,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-6 py-5 border-b border-purple-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-bold text-gray-900">
                        {purchase.project_name}
                      </h2>
                      <Badge className="bg-purple-100 text-purple-800">
                        CR #{purchase.cr_id}
                      </Badge>
                      {purchase.status === 'completed' && (
                        <Badge className="bg-green-600 text-white">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Completed
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4" />
                        {purchase.client}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        {purchase.location}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4" />
                        {purchase.boq_name}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-purple-200 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Package className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Materials</div>
                        <div className="text-2xl font-bold text-purple-600">
                          {purchase.materials_count}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <DollarSign className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Total Cost</div>
                        <div className="text-2xl font-bold text-green-600">
                          {formatCurrency(purchase.total_cost)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Hash className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Request Type</div>
                        <div className="text-sm font-semibold text-blue-900">
                          {purchase.request_type}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Item</div>
                      <div className="text-base font-semibold text-gray-900">{purchase.item_name}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Sub-Item</div>
                      <div className="text-base font-semibold text-gray-900">{purchase.sub_item_name}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Created Date</div>
                      <div className="flex items-center gap-2 text-gray-900">
                        <Calendar className="w-4 h-4" />
                        {new Date(purchase.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {purchase.approved_at && (
                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-1">Approved Date</div>
                        <div className="flex items-center gap-2 text-gray-900">
                          <Calendar className="w-4 h-4" />
                          {new Date(purchase.approved_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </div>
                      </div>
                    )}
                    {purchase.status === 'completed' && purchase.purchase_completion_date && (
                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-1">Completion Date</div>
                        <div className="flex items-center gap-2 text-green-600 font-medium">
                          <CheckCircle className="w-4 h-4" />
                          {new Date(purchase.purchase_completion_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </div>
                      </div>
                    )}
                    {purchase.status === 'completed' && purchase.purchase_completed_by_name && (
                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-1">Completed By</div>
                        <div className="flex items-center gap-2 text-gray-900">
                          <User className="w-4 h-4" />
                          {purchase.purchase_completed_by_name}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Justification */}
                {purchase.reason && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="text-sm font-semibold text-blue-800 mb-2">Justification</div>
                    <div className="text-sm text-blue-900">{purchase.reason}</div>
                  </div>
                )}

                {/* Completion Notes */}
                {purchase.status === 'completed' && purchase.purchase_notes && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="text-sm font-semibold text-green-800 mb-2">Completion Notes</div>
                    <div className="text-sm text-green-900">{purchase.purchase_notes}</div>
                  </div>
                )}

                {/* Materials Table */}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Materials Breakdown
                  </h3>
                  <div className="border rounded-xl overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold">Material Name</TableHead>
                          <TableHead className="font-semibold">Sub-Item</TableHead>
                          <TableHead className="font-semibold">Quantity</TableHead>
                          <TableHead className="font-semibold">Unit Price</TableHead>
                          <TableHead className="font-semibold text-right">Total Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {purchase.materials.map((material, idx) => (
                          <TableRow key={idx} className="hover:bg-gray-50">
                            <TableCell className="font-medium">{material.material_name}</TableCell>
                            <TableCell>
                              {material.sub_item_name && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  {material.sub_item_name}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {material.quantity} {material.unit}
                            </TableCell>
                            <TableCell>{formatCurrency(material.unit_price)}</TableCell>
                            <TableCell className="text-right font-bold text-purple-600">
                              {formatCurrency(material.total_price)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-purple-50 font-bold">
                          <TableCell colSpan={4} className="text-right">Total Cost:</TableCell>
                          <TableCell className="text-right text-purple-700 text-lg">
                            {formatCurrency(purchase.total_cost)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default PurchaseDetailsModal;
