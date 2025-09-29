import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileText,
  Package,
  Users,
  Calculator,
  Building2,
  MapPin,
  Calendar,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Download,
  Printer,
  Edit,
  Eye
} from 'lucide-react';
import { estimatorService } from '../services/estimatorService';
import { BOQGetResponse, BOQItemDetailed } from '../types';
import { toast } from 'sonner';

interface BOQDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  boq: any; // Can be either simple BOQ data from list or full BOQGetResponse
  onEdit?: () => void;
  onDownload?: () => void;
  onPrint?: () => void;
}

const BOQDetailsModal: React.FC<BOQDetailsModalProps> = ({
  isOpen,
  onClose,
  boq,
  onEdit,
  onDownload,
  onPrint
}) => {
  const [boqData, setBoqData] = useState<BOQGetResponse | null>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && boq?.boq_id) {
      fetchBOQDetails();
    }
  }, [isOpen, boq?.boq_id]);

  const fetchBOQDetails = async () => {
    if (!boq?.boq_id) return;

    setIsLoading(true);
    try {
      const result = await estimatorService.getBOQById(boq.boq_id);
      if (result.success && result.data) {
        setBoqData(result.data);
        // Auto-expand first few items for better UX
        setExpandedItems(result.data.items?.slice(0, 2).map((_, index) => `item-${index}`) || []);
      } else {
        toast.error(result.message || 'Failed to fetch BOQ details');
      }
    } catch (error) {
      toast.error('Error loading BOQ details');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const formatCurrency = (value: number) => {
    return `₹${value.toLocaleString('en-IN')}`;
  };

  const getStatusColor = (status: string) => {
    const normalizedStatus = status?.toLowerCase().replace('_', '') || 'draft';
    const colors: Record<string, string> = {
      draft: 'text-gray-600 bg-gray-100',
      inreview: 'text-yellow-700 bg-yellow-100',
      approved: 'text-green-700 bg-green-100',
      sentforconfirmation: 'text-blue-700 bg-blue-100',
      rejected: 'text-red-700 bg-red-100'
    };
    return colors[normalizedStatus] || colors.draft;
  };

  if (!isOpen) return null;

  const displayData = boqData || boq; // Use fetched data if available, otherwise use passed boq

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50"
              onClick={onClose}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-200 rounded-xl">
                      <FileText className="w-8 h-8 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-blue-900">BOQ Details</h2>
                      {displayData && (
                        <p className="text-sm text-blue-700">{displayData.boq_name || displayData.title || 'Unnamed BOQ'}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {onEdit && (
                      <button
                        onClick={onEdit}
                        className="p-2 text-blue-600 hover:bg-blue-200 rounded-lg transition-colors"
                        title="Edit BOQ"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                    )}
                    {onDownload && (
                      <button
                        onClick={onDownload}
                        className="p-2 text-blue-600 hover:bg-blue-200 rounded-lg transition-colors"
                        title="Download BOQ"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    )}
                    {onPrint && (
                      <button
                        onClick={onPrint}
                        className="p-2 text-blue-600 hover:bg-blue-200 rounded-lg transition-colors"
                        title="Print BOQ"
                      >
                        <Printer className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="p-2 text-gray-600 hover:bg-blue-200 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="mt-4 text-gray-600">Loading BOQ details...</p>
                    </div>
                  </div>
                ) : boqData ? (
                  <>
                    {/* Project Information */}
                    <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-xl p-6 mb-6 border border-blue-100">
                      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-blue-600" />
                        Project Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <span className="text-sm text-gray-600">Project Name</span>
                          <p className="font-medium">{boqData.project_details?.project_name || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Location</span>
                          <p className="font-medium flex items-center gap-1">
                            <MapPin className="w-4 h-4 text-gray-400" />
                            {boqData.project_details?.location || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Floor</span>
                          <p className="font-medium">{boqData.project_details?.floor || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Working Hours</span>
                          <p className="font-medium">{boqData.project_details?.hours || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Status</span>
                          <span className={`inline-block px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(boqData.status)}`}>
                            {boqData.status}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm text-gray-600">Created</span>
                          <p className="font-medium flex items-center gap-1">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            {boqData.created_at ? new Date(boqData.created_at).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Summary */}
                    {boqData.summary && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                        <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
                          <Calculator className="w-5 h-5" />
                          Cost Summary
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <span className="text-sm text-blue-700">Total Items</span>
                            <p className="text-xl font-bold text-blue-900">{boqData.summary.total_items}</p>
                          </div>
                          <div>
                            <span className="text-sm text-blue-700">Total Materials</span>
                            <p className="text-xl font-bold text-blue-900">{boqData.summary.total_materials}</p>
                          </div>
                          <div>
                            <span className="text-sm text-blue-700">Total Labour</span>
                            <p className="text-xl font-bold text-blue-900">{boqData.summary.total_labour}</p>
                          </div>
                          <div>
                            <span className="text-sm text-blue-700">Total Cost</span>
                            <p className="text-xl font-bold text-blue-900">{formatCurrency(boqData.summary.selling_price)}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-blue-200">
                          <div>
                            <span className="text-sm text-blue-700">Material Cost</span>
                            <p className="text-lg font-semibold text-blue-900">{formatCurrency(boqData.summary.total_material_cost)}</p>
                          </div>
                          <div>
                            <span className="text-sm text-blue-700">Labour Cost</span>
                            <p className="text-lg font-semibold text-blue-900">{formatCurrency(boqData.summary.total_labour_cost)}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* BOQ Items */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">BOQ Items</h3>
                      <div className="space-y-4">
                        {boqData.items?.map((item: BOQItemDetailed, index: number) => (
                          <div key={item.master_item_id || index} className="border border-gray-200 rounded-lg">
                            {/* Item Header */}
                            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <button
                                  onClick={() => toggleItemExpanded(`item-${index}`)}
                                  className="p-1 hover:bg-gray-200 rounded"
                                >
                                  {expandedItems.includes(`item-${index}`) ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </button>
                                <div className="flex-1">
                                  <span className="font-medium">{item.item_name}</span>
                                  {item.description && (
                                    <span className="ml-2 text-sm text-gray-600">{item.description}</span>
                                  )}
                                  {item.work_type && (
                                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                                      {item.work_type}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-semibold text-gray-900">
                                  {formatCurrency(item.selling_price)}
                                </p>
                                <p className="text-xs text-gray-600">Selling Price</p>
                              </div>
                            </div>

                            {/* Item Details (Expandable) */}
                            {expandedItems.includes(`item-${index}`) && (
                              <div className="p-4 space-y-4">
                                {/* Materials */}
                                {item.materials?.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                      <Package className="w-4 h-4" />
                                      Materials
                                    </h4>
                                    <div className="bg-gray-50 rounded p-3 space-y-2">
                                      {item.materials.map((material, mIndex) => (
                                        <div key={mIndex} className="flex justify-between text-sm">
                                          <span className="text-gray-600">
                                            {material.material_name} ({material.quantity} {material.unit})
                                          </span>
                                          <span className="font-medium">
                                            {formatCurrency(material.total_price)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Labour */}
                                {item.labour?.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                      <Users className="w-4 h-4" />
                                      Labour
                                    </h4>
                                    <div className="bg-gray-50 rounded p-3 space-y-2">
                                      {item.labour.map((labour, lIndex) => (
                                        <div key={lIndex} className="flex justify-between text-sm">
                                          <span className="text-gray-600">
                                            {labour.labour_role} ({labour.hours} hrs @ ₹{labour.rate_per_hour}/hr)
                                          </span>
                                          <span className="font-medium">
                                            {formatCurrency(labour.total_cost)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Cost Breakdown */}
                                <div className="bg-blue-50 rounded p-3">
                                  <h5 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
                                    <DollarSign className="w-4 h-4" />
                                    Cost Breakdown
                                  </h5>
                                  <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-blue-700">Base Cost:</span>
                                      <span className="font-medium">{formatCurrency(item.base_cost)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-blue-700">Overhead ({item.overhead_percentage}%):</span>
                                      <span className="font-medium">{formatCurrency(item.overhead_amount)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-blue-700">Profit Margin ({item.profit_margin_percentage}%):</span>
                                      <span className="font-medium">{formatCurrency(item.profit_margin_amount)}</span>
                                    </div>
                                    <div className="flex justify-between pt-2 border-t border-blue-200">
                                      <span className="text-blue-900 font-semibold">Total Cost:</span>
                                      <span className="font-bold text-blue-900">{formatCurrency(item.total_cost)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  // Simple BOQ display when full details aren't loaded
                  <div className="text-center py-8">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 inline-block">
                      <p className="text-yellow-800">
                        Click to load detailed BOQ information
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default BOQDetailsModal;