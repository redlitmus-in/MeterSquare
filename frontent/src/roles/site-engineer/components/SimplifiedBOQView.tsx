import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileText,
  Package,
  ChevronDown,
  ChevronRight,
  Info,
  Building2,
  Users
} from 'lucide-react';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import { BOQGetResponse } from '@/roles/estimator/types';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface SimplifiedBOQViewProps {
  isOpen: boolean;
  onClose: () => void;
  boq: any; // BOQ data with at least boq_id
  assignedItems?: any[]; // SE's assigned items from pm_assign_ss
}

const SimplifiedBOQView: React.FC<SimplifiedBOQViewProps> = ({
  isOpen,
  onClose,
  boq,
  assignedItems = [],
}) => {
  const [boqData, setBoqData] = useState<BOQGetResponse | null>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // If assignedItems are provided, use them directly (SE view)
      if (assignedItems && assignedItems.length > 0) {
        setBoqData({
          boq_id: boq?.boq_id,
          boq_name: boq?.boq_name,
          status: 'approved',
          project: boq?.project || { project_name: boq?.project_name },
          items: assignedItems,
        } as any);

        const expandedIds = assignedItems.slice(0, 2).map((_, index) => `item-${index}`);
        setExpandedItems(expandedIds);
      } else if (boq?.boq_id) {
        // Fallback: Fetch full BOQ (for admin or other roles)
        fetchBOQDetails();
      }
    }
  }, [isOpen, boq?.boq_id, assignedItems]);

  const fetchBOQDetails = async () => {
    if (!boq?.boq_id) return;

    setIsLoading(true);
    try {
      const result = await estimatorService.getBOQById(boq.boq_id);
      if (result.success && result.data) {
        setBoqData(result.data);

        // Auto-expand first 2 items
        const items = result.data.existing_purchase?.items || result.data.items || [];
        const expandedIds = items.slice(0, 2).map((_, index) => `item-${index}`);
        setExpandedItems(expandedIds);
      } else {
        showError(result.message || 'Failed to fetch BOQ details');
      }
    } catch (error) {
      showError('Error loading BOQ details');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItem = (itemId: string) => {
    setExpandedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleAll = () => {
    const items = boqData?.existing_purchase?.items || boqData?.items || [];
    if (expandedItems.length === items.length) {
      setExpandedItems([]);
    } else {
      setExpandedItems(items.map((_, index) => `item-${index}`));
    }
  };

  if (!isOpen) return null;

  const items = boqData?.existing_purchase?.items || boqData?.items || [];
  const allExpanded = expandedItems.length === items.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Compact on mobile */}
            <div className="bg-gradient-to-r from-[#243d8a] to-[#1e3270] px-3 sm:px-6 py-2.5 sm:py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg">
                  <FileText className="w-4 sm:w-6 h-4 sm:h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-base sm:text-xl font-bold text-white">BOQ Details</h2>
                  <p className="text-blue-100 text-[10px] sm:text-sm truncate max-w-[180px] sm:max-w-none">
                    {boqData?.project_details?.project_name || 'Loading...'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:bg-white/20 rounded-lg p-1.5 sm:p-2 transition-colors"
              >
                <X className="w-5 sm:w-6 h-5 sm:h-6" />
              </button>
            </div>

            {/* Content - Compact on mobile */}
            <div className="overflow-y-auto max-h-[calc(95vh-60px)] sm:max-h-[calc(90vh-80px)] p-3 sm:p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 sm:py-12">
                  <ModernLoadingSpinners variant="pulse-wave" />
                </div>
              ) : !boqData ? (
                <div className="text-center py-8 sm:py-12">
                  <Info className="w-10 sm:w-12 h-10 sm:h-12 text-gray-400 mx-auto mb-2 sm:mb-3" />
                  <p className="text-gray-600 text-sm sm:text-base">No BOQ data available</p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-6">
                  {/* Project Info - Compact grid on mobile */}
                  <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 rounded-lg sm:rounded-xl p-2.5 sm:p-4 border border-[#243d8a]/20">
                    <div className="grid grid-cols-3 gap-2 sm:gap-4">
                      <div>
                        <p className="text-[10px] sm:text-sm text-gray-600 mb-0.5 sm:mb-1">Project Name</p>
                        <p className="font-semibold text-gray-900 flex items-center gap-1 sm:gap-2 text-xs sm:text-base truncate">
                          <Building2 className="w-3 sm:w-4 h-3 sm:h-4 text-[#243d8a] flex-shrink-0" />
                          <span className="truncate">{boqData.project_details?.project_name || boq?.project_name || 'N/A'}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] sm:text-sm text-gray-600 mb-0.5 sm:mb-1">BOQ ID</p>
                        <p className="font-semibold text-gray-900 text-xs sm:text-base">BOQ-{boqData.boq_id}</p>
                      </div>
                      <div>
                        <p className="text-[10px] sm:text-sm text-gray-600 mb-0.5 sm:mb-1">Status</p>
                        <p className="font-semibold text-green-600 text-xs sm:text-base">{boqData.status || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Expand/Collapse All */}
                  <div className="flex justify-end">
                    <button
                      onClick={toggleAll}
                      className="text-xs sm:text-sm text-[#243d8a] hover:text-[#1e3270] font-medium flex items-center gap-1"
                    >
                      {allExpanded ? (
                        <>
                          <ChevronDown className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                          Collapse All
                        </>
                      ) : (
                        <>
                          <ChevronRight className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                          Expand All
                        </>
                      )}
                    </button>
                  </div>

                  {/* Items List */}
                  <div className="space-y-2 sm:space-y-4">
                    {items.length === 0 ? (
                      <div className="text-center py-8 sm:py-12 bg-gray-50 rounded-lg">
                        <Package className="w-10 sm:w-12 h-10 sm:h-12 text-gray-400 mx-auto mb-2 sm:mb-3" />
                        <p className="text-gray-600 text-sm sm:text-base">No items found in this BOQ</p>
                      </div>
                    ) : (
                      items.map((item: any, index: number) => {
                        const itemId = `item-${index}`;
                        const isExpanded = expandedItems.includes(itemId);

                        return (
                          <div
                            key={itemId}
                            className="bg-white rounded-lg border border-[#243d8a]/20 shadow-sm overflow-hidden"
                          >
                            {/* Item Header - Compact on mobile */}
                            <div
                              className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 p-2.5 sm:p-4 cursor-pointer hover:from-[#243d8a]/10 hover:to-[#243d8a]/15 transition-colors"
                              onClick={() => toggleItem(itemId)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                  <div className="p-1.5 sm:p-2 bg-[#243d8a] rounded-lg shadow-md flex-shrink-0">
                                    <Package className="w-4 sm:w-6 h-4 sm:h-6 text-white" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-sm sm:text-lg font-bold text-gray-900 truncate">
                                      {item.item_name || `Item ${index + 1}`}
                                    </h3>
                                    {item.description && (
                                      <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1 line-clamp-1">{item.description}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                                  {item.sub_items?.length > 0 && (
                                    <span className="text-[10px] sm:text-sm font-medium text-[#243d8a] bg-white px-1.5 sm:px-3 py-0.5 sm:py-1 rounded-full border border-[#243d8a]/20 whitespace-nowrap">
                                      {item.sub_items.length} sub-item{item.sub_items.length > 1 ? 's' : ''}
                                    </span>
                                  )}
                                  <button className="p-0.5 sm:p-1 hover:bg-[#243d8a]/10 rounded transition-colors">
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 sm:w-5 h-4 sm:h-5 text-[#243d8a]" />
                                    ) : (
                                      <ChevronRight className="w-4 sm:w-5 h-4 sm:h-5 text-[#243d8a]" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Item Details (Expandable) */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-2.5 sm:p-4 space-y-2.5 sm:space-y-4 bg-gray-50">
                                    {/* Show item-level materials from change requests if present */}
                                    {item.materials && item.materials.length > 0 && (
                                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                        <h5 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                                          <Package className="w-4 h-4" />
                                          New Material Purchase
                                          {item.has_change_request_materials && (
                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                              CR Materials
                                            </span>
                                          )}
                                        </h5>
                                        <div className="bg-white rounded-lg overflow-hidden border border-blue-200">
                                          <table className="min-w-full">
                                            <thead className="bg-blue-100">
                                              <tr>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                                                  Material
                                                </th>
                                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                                                  Sub-Item
                                                </th>
                                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">
                                                  Quantity
                                                </th>
                                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700">
                                                  Unit
                                                </th>
                                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">
                                                  Unit Price
                                                </th>
                                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">
                                                  Total
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                              {item.materials.map((material: any, matIndex: number) => (
                                                <tr key={matIndex} className="hover:bg-blue-50 transition-colors">
                                                  <td className="px-3 py-2 text-sm text-gray-900">
                                                    <div className="flex items-center gap-2">
                                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                      {material.material_name || 'N/A'}
                                                      {material.is_from_change_request && (
                                                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                                          New
                                                        </span>
                                                      )}
                                                    </div>
                                                  </td>
                                                  <td className="px-3 py-2 text-xs text-gray-600">
                                                    {material.sub_item_name || '-'}
                                                  </td>
                                                  <td className="px-3 py-2 text-sm text-gray-900 text-right font-medium">
                                                    {material.quantity || 0}
                                                  </td>
                                                  <td className="px-3 py-2 text-sm text-gray-700 text-center">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                                      {material.unit || 'N/A'}
                                                    </span>
                                                  </td>
                                                  <td className="px-3 py-2 text-sm text-gray-900 text-right">
                                                    AED {material.unit_price?.toFixed(2) || '0.00'}
                                                  </td>
                                                  <td className="px-3 py-2 text-sm font-semibold text-gray-900 text-right">
                                                    AED {material.total_price?.toFixed(2) || '0.00'}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                        {item.materials.some((m: any) => m.change_request_id) && (
                                          <p className="text-xs text-blue-700 mt-2 italic">
                                            * These materials were added through Change Request #{item.materials.find((m: any) => m.change_request_id)?.change_request_id}
                                          </p>
                                        )}
                                      </div>
                                    )}

                                    {/* Show basic item info if no sub-items (for assigned items from pm_assign_ss) */}
                                    {!item.sub_items || item.sub_items.length === 0 ? (
                                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                          <div>
                                            <p className="text-xs text-gray-600 mb-1">Item Code</p>
                                            <p className="font-semibold text-gray-900">{item.item_code || 'N/A'}</p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-600 mb-1">Quantity</p>
                                            <p className="font-semibold text-gray-900">{item.quantity || 0}</p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-600 mb-1">Unit</p>
                                            <p className="font-semibold text-gray-900">{item.unit || 'N/A'}</p>
                                          </div>
                                        </div>
                                        {item.description && (
                                          <div className="mt-3 pt-3 border-t border-gray-200">
                                            <p className="text-xs text-gray-600 mb-1">Description</p>
                                            <p className="text-sm text-gray-900">{item.description}</p>
                                          </div>
                                        )}
                                        {item.assigned_by_pm_name && (
                                          <div className="mt-3 pt-3 border-t border-gray-200">
                                            <p className="text-xs text-gray-600 mb-1">Assigned By</p>
                                            <p className="text-sm font-medium text-[#243d8a]">{item.assigned_by_pm_name}</p>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="space-y-2 sm:space-y-3">
                                        {item.sub_items.map((subItem: any, subIndex: number) => (
                                          <div
                                            key={subIndex}
                                            className="bg-white rounded-lg p-2.5 sm:p-4 border border-gray-200 shadow-sm"
                                          >
                                            <div className="mb-2 sm:mb-3">
                                              <h4 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                                                <FileText className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-[#243d8a]" />
                                                {subItem.sub_item_name || `Sub-Item ${subIndex + 1}`}
                                              </h4>
                                              {subItem.description && (
                                                <p className="text-[10px] sm:text-xs text-gray-600 ml-5 sm:ml-6 line-clamp-2">{subItem.description}</p>
                                              )}
                                            </div>

                                            {/* Raw Materials - Compact table on mobile */}
                                            {subItem.materials?.length > 0 && (
                                              <div className="mt-2 sm:mt-3">
                                                <h5 className="text-[10px] sm:text-xs font-semibold text-gray-700 mb-1.5 sm:mb-2 flex items-center gap-1">
                                                  <Package className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                                                  Raw Materials Required
                                                </h5>
                                                <div className="bg-gradient-to-r from-gray-50 to-[#243d8a]/5 rounded-lg overflow-hidden border border-gray-200">
                                                  <table className="min-w-full">
                                                    <thead className="bg-gray-100">
                                                      <tr>
                                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[10px] sm:text-xs font-semibold text-gray-700">
                                                          Material
                                                        </th>
                                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-right text-[10px] sm:text-xs font-semibold text-gray-700">
                                                          Quantity
                                                        </th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200">
                                                      {subItem.materials.map((material: any, matIndex: number) => (
                                                        <tr key={matIndex} className="hover:bg-[#243d8a]/5 transition-colors">
                                                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-sm text-gray-900">
                                                            <div className="flex items-center gap-1.5 sm:gap-2">
                                                              <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 bg-[#243d8a] rounded-full flex-shrink-0"></div>
                                                              <span className="truncate">{material.material_name || material.name || 'N/A'}</span>
                                                            </div>
                                                          </td>
                                                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-sm text-gray-900 text-right font-medium">
                                                            {material.quantity || 0}
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              </div>
                                            )}

                                            {/* Labour Required - Compact on mobile */}
                                            {subItem.labour?.length > 0 && (
                                              <div className="mt-2 sm:mt-3">
                                                <h5 className="text-[10px] sm:text-xs font-semibold text-gray-700 mb-1.5 sm:mb-2 flex items-center gap-1">
                                                  <Users className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                                                  Labour Required
                                                </h5>
                                                <div className="bg-gradient-to-r from-gray-50 to-green-50 rounded-lg overflow-hidden border border-gray-200">
                                                  <table className="min-w-full">
                                                    <thead className="bg-gray-100">
                                                      <tr>
                                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-left text-[10px] sm:text-xs font-semibold text-gray-700">
                                                          Labour Role
                                                        </th>
                                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-semibold text-gray-700">
                                                          Type
                                                        </th>
                                                        <th className="px-2 sm:px-3 py-1.5 sm:py-2 text-right text-[10px] sm:text-xs font-semibold text-gray-700">
                                                          Hours
                                                        </th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200">
                                                      {subItem.labour.map((labour: any, labIndex: number) => (
                                                        <tr key={labIndex} className="hover:bg-green-50 transition-colors">
                                                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-sm text-gray-900">
                                                            <div className="flex items-center gap-1.5 sm:gap-2">
                                                              <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                                                              <span className="truncate">{labour.labour_role || labour.type || 'N/A'}</span>
                                                            </div>
                                                          </td>
                                                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-sm text-gray-700 text-center">
                                                            <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-xs font-medium ${
                                                              labour.work_type === 'contract' ? 'bg-[#243d8a]/10 text-[#243d8a]' :
                                                              labour.work_type === 'daily_wages' ? 'bg-purple-100 text-purple-800' :
                                                              labour.work_type === 'piece_rate' ? 'bg-orange-100 text-orange-800' :
                                                              'bg-gray-100 text-gray-800'
                                                            }`}>
                                                              {labour.work_type === 'daily_wages' ? 'Daily' :
                                                               labour.work_type === 'piece_rate' ? 'Piece' :
                                                               labour.work_type === 'contract' ? 'Contract' :
                                                               labour.work_type || 'Contract'}
                                                            </span>
                                                          </td>
                                                          <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-sm text-gray-900 text-right font-medium">
                                                            {labour.hours || labour.quantity || 0}
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              </div>
                                            )}

                                            {(!subItem.materials || subItem.materials.length === 0) && (!subItem.labour || subItem.labour.length === 0) && (
                                              <div className="mt-2 sm:mt-3 text-center py-3 sm:py-4 bg-gray-50 rounded-lg border border-gray-200">
                                                <Info className="w-6 sm:w-8 h-6 sm:h-8 text-gray-400 mx-auto mb-1.5 sm:mb-2" />
                                                <p className="text-[10px] sm:text-xs text-gray-500">No materials or labour defined</p>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(SimplifiedBOQView);
