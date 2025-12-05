import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XCircle, ChevronDown, ChevronUp, Package, AlertCircle } from 'lucide-react';
import { ChangeRequestItem } from '@/services/changeRequestService';
import { formatCurrency, formatDate } from '@/utils/formatters';

interface RejectedRequestsSectionProps {
  requests: ChangeRequestItem[];
  onViewDetails: (crId: number) => void;
}

const RejectedRequestsSection: React.FC<RejectedRequestsSectionProps> = ({ requests, onViewDetails }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (requests.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mb-8"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full bg-gradient-to-r from-red-500 to-red-600 rounded-lg px-4 py-3 flex items-center justify-between hover:from-red-600 hover:to-red-700 transition-all"
      >
        <div className="flex items-center gap-2">
          <XCircle className="w-5 h-5 text-white" />
          <h3 className="text-lg font-bold text-white">Rejected Requests</h3>
          <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium text-white">
            {requests.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-white" />
        ) : (
          <ChevronDown className="w-5 h-5 text-white" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-2 border-red-200 rounded-b-lg p-4 bg-red-50/30">
              <div className="space-y-4">
                {requests.map((request) => (
                  <div
                    key={request.cr_id}
                    className="bg-white border-2 border-red-200 rounded-lg p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            REJECTED
                          </span>
                          <span className="text-xs text-gray-500">CR-{request.cr_id}</span>
                          {request.approval_date && (
                            <span className="text-xs text-gray-500">
                              • {formatDate(request.approval_date)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 italic mb-2">{request.justification}</p>
                      </div>
                    </div>

                    {/* Rejection Reason */}
                    {request.rejection_reason && (
                      <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-red-800 mb-1">Rejection Reason:</p>
                            <p className="text-sm text-red-700">{request.rejection_reason}</p>
                            {request.approved_by_name && (
                              <p className="text-xs text-red-600 mt-1">- {request.approved_by_name}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Materials Summary */}
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        Materials Requested ({request.materials_data?.length || 0} items)
                      </h4>
                      <div className="space-y-1">
                        {request.materials_data?.slice(0, 3).map((material, idx) => (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="text-gray-700">
                              {material.material_name} ({material.quantity} {material.unit})
                              {material.related_item && (
                                <span className="ml-2 text-blue-600">→ {material.related_item}</span>
                              )}
                            </span>
                            <span className="font-semibold text-gray-900">
                              {formatCurrency(material.total_price)}
                            </span>
                          </div>
                        ))}
                        {request.materials_data && request.materials_data.length > 3 && (
                          <p className="text-xs text-gray-500 mt-1">
                            +{request.materials_data.length - 3} more item(s)
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Cost Summary */}
                    <div className="flex justify-between items-center mb-3 pb-3 border-b border-gray-200">
                      <span className="text-sm font-semibold text-gray-700">Total Cost:</span>
                      <span className="text-lg font-bold text-red-600">
                        {formatCurrency(request.materials_total_cost)}
                      </span>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => onViewDetails(request.cr_id)}
                      className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                    >
                      View Full Details
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default RejectedRequestsSection;
