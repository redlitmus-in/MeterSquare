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
import { toast } from 'sonner';
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
        // Create a minimal BOQ data structure with only assigned items
        setBoqData({
          boq_id: boq?.boq_id,
          boq_name: boq?.boq_name,
          status: 'approved',
          project: boq?.project || { project_name: boq?.project_name },
          items: assignedItems,
        } as any);

        // Auto-expand first 2 items
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
        toast.error(result.message || 'Failed to fetch BOQ details');
      }
    } catch (error) {
      toast.error('Error loading BOQ details');
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
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-[#243d8a] to-[#1e3270] px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">BOQ Details</h2>
                  <p className="text-blue-100 text-sm">
                    {boqData?.project?.project_name || 'Loading...'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <ModernLoadingSpinners variant="pulse" color="blue" />
                </div>
              ) : !boqData ? (
                <div className="text-center py-12">
                  <Info className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">No BOQ data available</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Project Info */}
                  <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 rounded-xl p-4 border border-[#243d8a]/20">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Project Name</p>
                        <p className="font-semibold text-gray-900 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#243d8a]" />
                          {boqData.project?.project_name || boqData.project_name || boq?.project_name || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">BOQ ID</p>
                        <p className="font-semibold text-gray-900">BOQ-{boqData.boq_id}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Status</p>
                        <p className="font-semibold text-green-600">{boqData.status || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Expand/Collapse All */}
                  <div className="flex justify-end">
                    <button
                      onClick={toggleAll}
                      className="text-sm text-[#243d8a] hover:text-[#1e3270] font-medium flex items-center gap-1"
                    >
                      {allExpanded ? (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          Collapse All
                        </>
                      ) : (
                        <>
                          <ChevronRight className="w-4 h-4" />
                          Expand All
                        </>
                      )}
                    </button>
                  </div>

                  {/* Items List */}
                  <div className="space-y-4">
                    {items.length === 0 ? (
                      <div className="text-center py-12 bg-gray-50 rounded-lg">
                        <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600">No items found in this BOQ</p>
                      </div>
                    ) : (
                      items.map((item: any, index: number) => {
                        const itemId = `item-${index}`;
                        const isExpanded = expandedItems.includes(itemId);

                        return (
                          <div
                            key={itemId}
                            className="bg-white rounded-lg border-2 border-[#243d8a]/20 shadow-sm overflow-hidden"
                          >
                            {/* Item Header */}
                            <div
                              className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 p-4 cursor-pointer hover:from-[#243d8a]/10 hover:to-[#243d8a]/15 transition-colors"
                              onClick={() => toggleItem(itemId)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                  <div className="p-2 bg-[#243d8a] rounded-lg shadow-md">
                                    <Package className="w-6 h-6 text-white" />
                                  </div>
                                  <div className="flex-1">
                                    <h3 className="text-lg font-bold text-gray-900">
                                      {item.item_name || `Item ${index + 1}`}
                                    </h3>
                                    {item.description && (
                                      <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  {item.sub_items?.length > 0 && (
                                    <span className="text-sm font-medium text-[#243d8a] bg-white px-3 py-1 rounded-full border border-[#243d8a]/20">
                                      {item.sub_items.length} sub-item{item.sub_items.length > 1 ? 's' : ''}
                                    </span>
                                  )}
                                  <button className="p-1 hover:bg-[#243d8a]/10 rounded transition-colors">
                                    {isExpanded ? (
                                      <ChevronDown className="w-5 h-5 text-[#243d8a]" />
                                    ) : (
                                      <ChevronRight className="w-5 h-5 text-[#243d8a]" />
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
                                  <div className="p-4 space-y-4 bg-gray-50">
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
                                      <div className="space-y-3">
                                        {item.sub_items.map((subItem: any, subIndex: number) => (
                                          <div
                                            key={subIndex}
                                            className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm"
                                          >
                                            <div className="mb-3">
                                              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-1">
                                                <FileText className="w-4 h-4 text-[#243d8a]" />
                                                {subItem.sub_item_name || `Sub-Item ${subIndex + 1}`}
                                              </h4>
                                              {subItem.description && (
                                                <p className="text-xs text-gray-600 ml-6">{subItem.description}</p>
                                              )}
                                            </div>

                                            {/* Raw Materials */}
                                            {subItem.materials?.length > 0 && (
                                              <div className="mt-3">
                                                <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                                                  <Package className="w-3.5 h-3.5" />
                                                  Raw Materials Required
                                                </h5>
                                                <div className="bg-gradient-to-r from-gray-50 to-[#243d8a]/5 rounded-lg overflow-hidden border border-gray-200">
                                                  <table className="min-w-full">
                                                    <thead className="bg-gray-100">
                                                      <tr>
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                                                          Material
                                                        </th>
                                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">
                                                          Quantity
                                                        </th>
                                                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700">
                                                          Unit
                                                        </th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200">
                                                      {subItem.materials.map((material: any, matIndex: number) => (
                                                        <tr key={matIndex} className="hover:bg-[#243d8a]/5 transition-colors">
                                                          <td className="px-3 py-2 text-sm text-gray-900">
                                                            <div className="flex items-center gap-2">
                                                              <div className="w-2 h-2 bg-[#243d8a] rounded-full"></div>
                                                              {material.material_name || material.name || 'N/A'}
                                                            </div>
                                                          </td>
                                                          <td className="px-3 py-2 text-sm text-gray-900 text-right font-medium">
                                                            {material.quantity || 0}
                                                          </td>
                                                          <td className="px-3 py-2 text-sm text-gray-700 text-center">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#243d8a]/10 text-[#243d8a]">
                                                              {material.unit || 'N/A'}
                                                            </span>
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              </div>
                                            )}

                                            {/* Labour Required */}
                                            {subItem.labour?.length > 0 && (
                                              <div className="mt-3">
                                                <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                                                  <Users className="w-3.5 h-3.5" />
                                                  Labour Required
                                                </h5>
                                                <div className="bg-gradient-to-r from-gray-50 to-green-50 rounded-lg overflow-hidden border border-gray-200">
                                                  <table className="min-w-full">
                                                    <thead className="bg-gray-100">
                                                      <tr>
                                                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">
                                                          Labour Role
                                                        </th>
                                                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700">
                                                          Work Type
                                                        </th>
                                                        <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700">
                                                          Hours
                                                        </th>
                                                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700">
                                                          Unit
                                                        </th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200">
                                                      {subItem.labour.map((labour: any, labIndex: number) => (
                                                        <tr key={labIndex} className="hover:bg-green-50 transition-colors">
                                                          <td className="px-3 py-2 text-sm text-gray-900">
                                                            <div className="flex items-center gap-2">
                                                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                              {labour.labour_role || labour.type || 'N/A'}
                                                            </div>
                                                          </td>
                                                          <td className="px-3 py-2 text-sm text-gray-700 text-center">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                              labour.work_type === 'contract' ? 'bg-[#243d8a]/10 text-[#243d8a]' :
                                                              labour.work_type === 'daily_wages' ? 'bg-purple-100 text-purple-800' :
                                                              labour.work_type === 'piece_rate' ? 'bg-orange-100 text-orange-800' :
                                                              'bg-gray-100 text-gray-800'
                                                            }`}>
                                                              {labour.work_type === 'daily_wages' ? 'Daily Wages' :
                                                               labour.work_type === 'piece_rate' ? 'Piece Rate' :
                                                               labour.work_type === 'contract' ? 'Contract' :
                                                               labour.work_type || 'Contract'}
                                                            </span>
                                                          </td>
                                                          <td className="px-3 py-2 text-sm text-gray-900 text-right font-medium">
                                                            {labour.hours || labour.quantity || 0}
                                                          </td>
                                                          <td className="px-3 py-2 text-sm text-gray-700 text-center">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                              hrs
                                                            </span>
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              </div>
                                            )}

                                            {(!subItem.materials || subItem.materials.length === 0) && (!subItem.labour || subItem.labour.length === 0) && (
                                              <div className="mt-3 text-center py-4 bg-gray-50 rounded-lg border border-gray-200">
                                                <Info className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                                <p className="text-xs text-gray-500">No materials or labour defined for this sub-item</p>
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

export default SimplifiedBOQView;
