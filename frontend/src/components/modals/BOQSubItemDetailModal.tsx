import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, FileText, Eye, Loader2, MapPin, Ruler, Tag, Hash, DollarSign, Image as ImageIcon, AlertCircle, CheckCircle } from 'lucide-react';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import { formatCurrency } from '@/utils/formatters';

interface BOQSubItemDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  boqId: number;
  subItemName: string;
  boqName?: string;
  materialName?: string; // Filter to show only this material
}

interface LabourData {
  labour_role: string;
  hours?: number;
  rate_per_hour?: number;
  total_cost?: number;
  work_type?: string;
}

interface MaterialData {
  material_name: string;
  brand?: string;
  size?: string;
  specification?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  total_price?: number;
}

interface SubItemData {
  sub_item_name: string;
  scope?: string;
  size?: string;
  location?: string;
  brand?: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  amount?: number;
  // Cost breakdown
  material_cost?: number;
  labour_cost?: number;
  internal_cost?: number;
  planned_profit?: number;
  actual_profit?: number;
  // Percentages
  misc_percentage?: number;
  misc_amount?: number;
  overhead_profit_percentage?: number;
  overhead_profit_amount?: number;
  transport_percentage?: number;
  transport_amount?: number;
  // Nested data
  sub_item_image?: Array<{ url: string; original_name?: string; filename?: string }>;
  materials?: MaterialData[];
  labour?: LabourData[];
}

interface ItemData {
  item_name: string;
  item_description?: string;
  description?: string;
  work_type?: string;
  sub_items: SubItemData[];
}

const BOQSubItemDetailModal: React.FC<BOQSubItemDetailModalProps> = ({
  isOpen,
  onClose,
  boqId,
  subItemName,
  boqName,
  materialName
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchedItem, setMatchedItem] = useState<ItemData | null>(null);
  const [matchedSubItem, setMatchedSubItem] = useState<SubItemData | null>(null);
  const [boqData, setBoqData] = useState<any>(null);

  useEffect(() => {
    if (isOpen && boqId && subItemName) {
      fetchBOQAndFindSubItem();
    }
  }, [isOpen, boqId, subItemName]);

  const fetchBOQAndFindSubItem = async () => {
    setIsLoading(true);
    setError(null);
    setMatchedItem(null);
    setMatchedSubItem(null);

    try {
      const result = await estimatorService.getBOQById(boqId);
      console.log('BOQ Data received:', result.data);

      if (result.success && result.data) {
        setBoqData(result.data);

        // Search through all items to find the matching sub-item
        const items = result.data.existing_purchase?.items || result.data.items || [];
        console.log('Searching in items:', items.length, 'items for sub-item:', subItemName);

        let found = false;
        for (const item of items) {
          console.log('Checking item:', item.item_name, 'sub_items:', item.sub_items?.length || 0);

          const foundSubItem = item.sub_items?.find((subItem: SubItemData) => {
            const nameMatch = subItem.sub_item_name === subItemName;
            const scopeMatch = subItem.scope === subItemName;
            console.log('  Comparing:', subItem.sub_item_name, '/', subItem.scope, 'vs', subItemName, '=> name:', nameMatch, 'scope:', scopeMatch);
            return nameMatch || scopeMatch;
          });

          if (foundSubItem) {
            console.log('Found matching sub-item:', foundSubItem);
            setMatchedItem(item);
            setMatchedSubItem(foundSubItem);
            found = true;
            break;
          }
        }

        if (!found) {
          console.log('Sub-item not found in BOQ');
          setError(`Sub-item "${subItemName}" not found in BOQ`);
        }
      } else {
        setError(result.message || 'Failed to fetch BOQ details');
      }
    } catch (err) {
      console.error('Error fetching BOQ:', err);
      setError('Error loading BOQ details');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-700 rounded-lg">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">BOQ Item Details</h2>
                  <p className="text-slate-600 text-sm">{boqName || `BOQ #${boqId}`}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-700" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-slate-600 animate-spin mb-3" />
                <p className="text-gray-600">Loading BOQ item details...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="w-12 h-12 text-red-500 mb-3" />
                <p className="text-gray-700 font-medium">{error}</p>
                <p className="text-gray-500 text-sm mt-1">The sub-item may have been renamed or removed from the BOQ.</p>
              </div>
            ) : matchedItem && matchedSubItem ? (
              <div className="space-y-6">
                {/* Parent Item Info */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-5 h-5 text-gray-600" />
                    <h3 className="font-bold text-gray-900">Parent Item</h3>
                  </div>
                  <p className="text-gray-800 font-medium">{matchedItem.item_name}</p>
                  {matchedItem.item_description && (
                    <p className="text-gray-600 text-sm mt-1">{matchedItem.item_description}</p>
                  )}
                </div>

                {/* Sub-Item Details */}
                <div className="bg-white rounded-xl p-5 border-2 border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <FileText className="w-5 h-5 text-slate-700" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">{matchedSubItem.sub_item_name || matchedSubItem.scope}</h3>
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold bg-green-600 text-white rounded">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Found in BOQ Scope
                      </span>
                    </div>
                  </div>

                  {/* Scope Description */}
                  {matchedSubItem.scope && matchedSubItem.scope !== matchedSubItem.sub_item_name && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-xs text-slate-600 mb-1 font-semibold">Scope / Description</p>
                      <p className="text-slate-800">{matchedSubItem.scope}</p>
                    </div>
                  )}

                  {/* Specifications Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {matchedSubItem.size && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1">
                          <Ruler className="w-3.5 h-3.5" />
                          Size
                        </div>
                        <p className="font-medium text-gray-900">{matchedSubItem.size}</p>
                      </div>
                    )}
                    {matchedSubItem.location && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1">
                          <MapPin className="w-3.5 h-3.5" />
                          Location
                        </div>
                        <p className="font-medium text-gray-900">{matchedSubItem.location}</p>
                      </div>
                    )}
                    {matchedSubItem.brand && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1">
                          <Tag className="w-3.5 h-3.5" />
                          Brand
                        </div>
                        <p className="font-medium text-gray-900">{matchedSubItem.brand}</p>
                      </div>
                    )}
                    {(matchedSubItem.quantity !== undefined || matchedSubItem.unit) && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1">
                          <Hash className="w-3.5 h-3.5" />
                          Quantity
                        </div>
                        <p className="font-medium text-gray-900">
                          {matchedSubItem.quantity || 0} {matchedSubItem.unit || ''}
                        </p>
                      </div>
                    )}
                    {matchedSubItem.rate !== undefined && matchedSubItem.rate > 0 && (
                      <div className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center gap-1.5 text-gray-500 text-xs mb-1">
                          <DollarSign className="w-3.5 h-3.5" />
                          BOQ Rate
                        </div>
                        <p className="font-medium text-gray-900">{formatCurrency(matchedSubItem.rate)}</p>
                      </div>
                    )}
                  </div>

                  {/* Images */}
                  {matchedSubItem.sub_item_image && Array.isArray(matchedSubItem.sub_item_image) && matchedSubItem.sub_item_image.length > 0 && (
                    <div className="mb-4 p-4 bg-white rounded-lg border border-gray-200">
                      <h5 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        Reference Images ({matchedSubItem.sub_item_image.length})
                      </h5>
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                        {matchedSubItem.sub_item_image.map((image, imgIndex) => (
                          <div
                            key={imgIndex}
                            className="relative group cursor-pointer aspect-square"
                            onClick={() => window.open(image.url, '_blank')}
                          >
                            <img
                              src={image.url}
                              alt={`${matchedSubItem.sub_item_name} - ${image.original_name || image.filename || `Image ${imgIndex + 1}`}`}
                              className="w-full h-full object-cover rounded-lg border-2 border-gray-200 hover:border-purple-500 transition-all"
                            />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all rounded-lg flex items-center justify-center">
                              <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Materials in this Sub-Item */}
                  {matchedSubItem.materials && matchedSubItem.materials.length > 0 && (() => {
                    // Filter materials if materialName is provided
                    const filteredMaterials = materialName
                      ? matchedSubItem.materials.filter(m => m.material_name === materialName)
                      : matchedSubItem.materials;

                    if (filteredMaterials.length === 0) return null;

                    return (
                    <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mb-4">
                      <h5 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <Package className="w-4 h-4 text-slate-600" />
                        Material Details {materialName && `- ${materialName}`}
                      </h5>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border border-slate-200">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                              <th className="py-3 px-4 text-left font-semibold">Material</th>
                              <th className="py-3 px-4 text-left font-semibold">Brand</th>
                              <th className="py-3 px-4 text-left font-semibold">Size/Spec</th>
                              <th className="py-3 px-4 text-center font-semibold">Quantity</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {filteredMaterials.map((material, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="py-3 px-4 font-medium text-slate-900">{material.material_name}</td>
                                <td className="py-3 px-4 text-slate-700">{material.brand || '-'}</td>
                                <td className="py-3 px-4 text-slate-700">{material.size || material.specification || '-'}</td>
                                <td className="py-3 px-4 text-center text-slate-700">
                                  {material.quantity || 0} {material.unit || ''}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    );
                  })()}
                </div>

                {/* Footer info */}
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>This item is part of the approved BOQ scope</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="w-12 h-12 text-gray-400 mb-3" />
                <p className="text-gray-600">No data available</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default BOQSubItemDetailModal;
