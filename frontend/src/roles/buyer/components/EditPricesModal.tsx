import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  DollarSign,
  Package,
  Save,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertCircle,
  CheckCircle,
  RotateCcw,
  Store,
  Truck,
  Hourglass
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/utils/formatters';
import { Purchase, buyerService } from '../services/buyerService';
import { showSuccess, showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface EditPricesModalProps {
  purchase: Purchase;
  isOpen: boolean;
  onClose: () => void;
  onPricesUpdated?: () => void;
}

interface MaterialPriceState {
  material_name: string;
  quantity: number;
  unit: string;
  original_unit_price: number;
  negotiated_price: number | null;
  isEditing: boolean;
  tempPrice: string;
}

const EditPricesModal: React.FC<EditPricesModalProps> = ({
  purchase,
  isOpen,
  onClose,
  onPricesUpdated
}) => {
  const [materialPrices, setMaterialPrices] = useState<MaterialPriceState[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Get store-sent materials count for display
  const storeRequestedMaterials = purchase.store_requested_materials || [];
  const storeRequestedCount = storeRequestedMaterials.length;

  // Pre-compute POChild lookup map for O(1) material status lookup
  const materialToPOChildMap = useMemo(() => {
    const map = new Map<string, any>();
    const poChildren = purchase.po_children || [];

    poChildren.forEach(poChild => {
      poChild.materials?.forEach((m: any) => {
        if (m.material_name) {
          const key = m.material_name.toLowerCase().trim();
          map.set(key, poChild);
        }
      });
    });

    return map;
  }, [purchase.po_children]);

  // Count vendor-sent materials for indicator
  const vendorSentCount = useMemo(() => {
    return purchase.materials?.filter(m => {
      const key = m.material_name.toLowerCase().trim();
      return materialToPOChildMap.has(key);
    }).length || 0;
  }, [purchase.materials, materialToPOChildMap]);

  // Initialize material prices from purchase (excluding store-sent and vendor-sent materials)
  useEffect(() => {
    if (isOpen && purchase.materials) {
      // Filter out materials that have been sent to store OR sent to vendor
      const availableMaterials = purchase.materials.filter(material => {
        const isSentToStore = storeRequestedMaterials.includes(material.material_name);
        const isSentToVendor = materialToPOChildMap.has(material.material_name.toLowerCase().trim());
        return !isSentToStore && !isSentToVendor;
      });

      const initialPrices = availableMaterials.map(material => ({
        material_name: material.material_name,
        quantity: material.quantity,
        unit: material.unit,
        original_unit_price: (material as any).original_unit_price || material.unit_price,
        negotiated_price: (material as any).negotiated_price || null,
        isEditing: false,
        tempPrice: ''
      }));
      setMaterialPrices(initialPrices);
      setHasChanges(false);
    }
  }, [isOpen, purchase, storeRequestedMaterials, materialToPOChildMap]);

  // Calculate totals
  const totals = useMemo(() => {
    const originalTotal = materialPrices.reduce((sum, m) =>
      sum + (m.original_unit_price * m.quantity), 0);
    const currentTotal = materialPrices.reduce((sum, m) => {
      const price = m.negotiated_price !== null ? m.negotiated_price : m.original_unit_price;
      return sum + (price * m.quantity);
    }, 0);
    const diff = currentTotal - originalTotal;
    const diffPercentage = originalTotal > 0 ? (diff / originalTotal) * 100 : 0;

    return { originalTotal, currentTotal, diff, diffPercentage };
  }, [materialPrices]);

  const handleStartEdit = (materialName: string) => {
    setMaterialPrices(prev => prev.map(m => {
      if (m.material_name === materialName) {
        const currentPrice = m.negotiated_price !== null ? m.negotiated_price : m.original_unit_price;
        return { ...m, isEditing: true, tempPrice: currentPrice.toString() };
      }
      return m;
    }));
  };

  const handleCancelEdit = (materialName: string) => {
    setMaterialPrices(prev => prev.map(m =>
      m.material_name === materialName ? { ...m, isEditing: false, tempPrice: '' } : m
    ));
  };

  const handleSavePrice = (materialName: string) => {
    const material = materialPrices.find(m => m.material_name === materialName);
    if (!material) return;

    const newPrice = parseFloat(material.tempPrice);
    if (isNaN(newPrice) || newPrice < 0) {
      showError('Please enter a valid price');
      return;
    }

    setMaterialPrices(prev => prev.map(m => {
      if (m.material_name === materialName) {
        // If new price equals original, clear negotiated price
        const negotiated = newPrice === m.original_unit_price ? null : newPrice;
        return { ...m, negotiated_price: negotiated, isEditing: false, tempPrice: '' };
      }
      return m;
    }));
    setHasChanges(true);
  };

  const handleResetPrice = (materialName: string) => {
    setMaterialPrices(prev => prev.map(m => {
      if (m.material_name === materialName) {
        return { ...m, negotiated_price: null, isEditing: false, tempPrice: '' };
      }
      return m;
    }));
    setHasChanges(true);
  };

  const handleResetAll = () => {
    setMaterialPrices(prev => prev.map(m => ({
      ...m,
      negotiated_price: null,
      isEditing: false,
      tempPrice: ''
    })));
    setHasChanges(true);
  };

  const handleSaveAll = async () => {
    try {
      setIsSaving(true);

      // Prepare materials update data
      const materialsToUpdate = materialPrices.map(m => ({
        material_name: m.material_name,
        negotiated_price: m.negotiated_price
      }));

      const response = await buyerService.updatePurchasePrices(purchase.cr_id, materialsToUpdate);

      showSuccess(response.message || 'Prices updated successfully');
      setHasChanges(false);
      onPricesUpdated?.();
      onClose();
    } catch (error: any) {
      showError(error.message || 'Failed to update prices');
    } finally {
      setIsSaving(false);
    }
  };

  const getPriceDiffDisplay = (original: number, negotiated: number | null) => {
    if (negotiated === null) return null;
    const diff = negotiated - original;
    const percentage = original > 0 ? (diff / original) * 100 : 0;

    if (diff === 0) return null;

    return {
      diff,
      percentage,
      isIncrease: diff > 0,
      isDecrease: diff < 0
    };
  };

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
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-6 py-5 border-b bg-gradient-to-r from-amber-50 to-orange-100 border-amber-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <DollarSign className="w-6 h-6 text-amber-600" />
                      <h2 className="text-xl font-bold text-gray-900">
                        Edit Negotiated Prices
                      </h2>
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">PO-{purchase.cr_id}</span>
                      <span className="ml-2 text-gray-500">- {purchase.item_name}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Update prices based on vendor negotiation before sending for approval.
                    </p>
                    {/* Store-sent and vendor-sent materials indicators */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {storeRequestedCount > 0 && (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 border border-purple-300 rounded-lg">
                          <Store className="w-4 h-4 text-purple-600" />
                          <span className="text-xs font-medium text-purple-800">
                            {storeRequestedCount} material(s) sent to M2 Store
                          </span>
                          <span className="text-xs text-purple-600">
                            (not shown below)
                          </span>
                        </div>
                      )}
                      {vendorSentCount > 0 && (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 border border-amber-300 rounded-lg">
                          <Truck className="w-4 h-4 text-amber-600" />
                          <span className="text-xs font-medium text-amber-800">
                            {vendorSentCount} material(s) sent to vendor
                          </span>
                          <span className="text-xs text-amber-600">
                            (not shown below)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-amber-200 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">Original Total</div>
                    <div className="text-lg font-bold text-gray-700">
                      {formatCurrency(totals.originalTotal)}
                    </div>
                  </div>
                  <div className={`rounded-lg p-4 border ${
                    totals.diff < 0
                      ? 'bg-green-50 border-green-200'
                      : totals.diff > 0
                        ? 'bg-red-50 border-red-200'
                        : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="text-xs text-gray-500 mb-1">Negotiated Total</div>
                    <div className={`text-lg font-bold ${
                      totals.diff < 0 ? 'text-green-700' : totals.diff > 0 ? 'text-red-700' : 'text-gray-700'
                    }`}>
                      {formatCurrency(totals.currentTotal)}
                    </div>
                  </div>
                  <div className={`rounded-lg p-4 border ${
                    totals.diff < 0
                      ? 'bg-green-50 border-green-200'
                      : totals.diff > 0
                        ? 'bg-red-50 border-red-200'
                        : 'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="text-xs text-gray-500 mb-1">Difference</div>
                    <div className={`text-lg font-bold flex items-center gap-1 ${
                      totals.diff < 0 ? 'text-green-700' : totals.diff > 0 ? 'text-red-700' : 'text-gray-700'
                    }`}>
                      {totals.diff < 0 ? (
                        <TrendingDown className="w-4 h-4" />
                      ) : totals.diff > 0 ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <Minus className="w-4 h-4" />
                      )}
                      {formatCurrency(Math.abs(totals.diff))}
                      <span className="text-xs font-normal ml-1">
                        ({totals.diff <= 0 ? '' : '+'}{totals.diffPercentage.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Materials Table */}
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold">Material</TableHead>
                        <TableHead className="font-semibold text-center">Qty</TableHead>
                        <TableHead className="font-semibold text-right">Unit Price</TableHead>
                        <TableHead className="font-semibold text-right">Total</TableHead>
                        <TableHead className="font-semibold text-center w-40">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materialPrices.map((material, index) => {
                        const currentPrice = material.negotiated_price !== null
                          ? material.negotiated_price
                          : material.original_unit_price;
                        const totalPrice = currentPrice * material.quantity;
                        const hasNegotiatedPrice = material.negotiated_price !== null;

                        return (
                          <TableRow key={index} className="hover:bg-gray-50">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-gray-400" />
                                <span className="font-medium text-sm">{material.material_name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {material.quantity} {material.unit}
                            </TableCell>
                            <TableCell className="text-right">
                              {material.isEditing ? (
                                <div className="flex items-center justify-end gap-2">
                                  <Input
                                    type="number"
                                    value={material.tempPrice || ''}
                                    placeholder="0.00"
                                    onChange={(e) => {
                                      setMaterialPrices(prev => prev.map(m =>
                                        m.material_name === material.material_name
                                          ? { ...m, tempPrice: e.target.value }
                                          : m
                                      ));
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSavePrice(material.material_name);
                                      if (e.key === 'Escape') handleCancelEdit(material.material_name);
                                    }}
                                    className="w-32 h-10 text-base text-right font-medium border-2 border-amber-400 focus:border-amber-500"
                                    autoFocus
                                    min="0"
                                    step="0.01"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => handleSavePrice(material.material_name)}
                                    className="h-10 w-10 p-0 bg-green-500 hover:bg-green-600 text-white"
                                  >
                                    <CheckCircle className="w-5 h-5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleCancelEdit(material.material_name)}
                                    className="h-10 w-10 p-0 border-gray-300"
                                  >
                                    <X className="w-5 h-5" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex flex-col items-end">
                                  {/* Only show amber color and strikethrough if price actually changed */}
                                  {hasNegotiatedPrice && currentPrice !== material.original_unit_price ? (
                                    <>
                                      <span className="text-base font-bold text-amber-600">
                                        {formatCurrency(currentPrice)}
                                      </span>
                                      <span className="text-xs text-gray-400 line-through">
                                        {formatCurrency(material.original_unit_price)}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-base font-bold text-gray-900">
                                      {formatCurrency(currentPrice)}
                                    </span>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-base font-bold text-gray-900">
                                {formatCurrency(totalPrice)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {!material.isEditing && (
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleStartEdit(material.material_name)}
                                    className="h-9 px-4 text-sm font-medium border-2 border-amber-400 text-amber-700 hover:bg-amber-50"
                                  >
                                    Edit Price
                                  </Button>
                                  {/* Only show reset button if price actually changed */}
                                  {hasNegotiatedPrice && currentPrice !== material.original_unit_price && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleResetPrice(material.material_name)}
                                      className="h-9 w-9 p-0 text-gray-500 hover:text-red-600 hover:bg-red-50"
                                      title="Reset to original price"
                                    >
                                      <RotateCcw className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Info Banner */}
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <strong>Note:</strong> Negotiated prices will be used when selecting vendors and generating LPO/Purchase Orders.
                    Original prices are preserved for comparison and reporting purposes.
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-end">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={onClose}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveAll}
                    disabled={!hasChanges || isSaving}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {isSaving ? (
                      <>
                        <ModernLoadingSpinners size="xs" className="mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default EditPricesModal;
