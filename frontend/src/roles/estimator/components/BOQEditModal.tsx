import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Save,
  Plus,
  Trash2,
  FileText,
  Package,
  Users,
  Calculator,
  AlertCircle,
  Loader2,
  Wrench,
  DollarSign,
  Search,
  PlusCircle,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { BOQ, BOQItemDetailed, BOQUpdatePayload, BOQMaterial, BOQLabour, WorkType } from '../types';
import { estimatorService } from '../services/estimatorService';
import { ModernSelect } from '@/components/ui/modern-select';

// Master data interfaces
interface MasterItem {
  item_id: number;
  item_name: string;
  description?: string;
  default_overhead_percentage?: number;
  default_profit_percentage?: number;
}

interface MasterMaterial {
  material_id: number;
  material_name: string;
  current_market_price: number;
  default_unit: string;
}

interface MasterLabour {
  labour_id: number;
  labour_role: string;
  amount: number;
  work_type: string;
}

interface BOQEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  boq: BOQ | null;
  onSave: () => void;
  isRevision?: boolean; // Flag to indicate this is a revision edit
}

// Unit options for materials
const UNIT_OPTIONS = [
  { value: 'nos', label: 'Nos' },
  { value: 'kgs', label: 'Kgs' },
  { value: 'ltr', label: 'Ltr' },
  { value: 'mtrs', label: 'Mtrs' },
  { value: 'sq.m', label: 'Sq.m' },
  { value: 'cu.m', label: 'Cu.m' },
  { value: 'box', label: 'Box' },
  { value: 'bag', label: 'Bag' },
  { value: 'pcs', label: 'Pcs' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'roll', label: 'Roll' },
  { value: 'sheet', label: 'Sheet' },
  { value: 'tons', label: 'Tons' },
  { value: 'gms', label: 'Gms' },
  { value: 'ml', label: 'Ml' },
  { value: 'ft', label: 'Ft' },
  { value: 'sq.ft', label: 'Sq.ft' },
  { value: 'set', label: 'Set' },
  { value: 'pair', label: 'Pair' },
  { value: 'carton', label: 'Carton' },
  { value: 'drum', label: 'Drum' },
  { value: 'can', label: 'Can' }
];

const BOQEditModal: React.FC<BOQEditModalProps> = ({
  isOpen,
  onClose,
  boq,
  onSave,
  isRevision = false
}) => {
  const [editedBoq, setEditedBoq] = useState<BOQUpdatePayload | null>(null);
  const [originalBoq, setOriginalBoq] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'items' | 'summary'>('items');
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  // VAT mode state - tracks which items use per-material VAT
  const [useMaterialVAT, setUseMaterialVAT] = useState<Record<number, boolean>>({});

  // Master data states
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [itemMaterials, setItemMaterials] = useState<Record<number, MasterMaterial[]>>({});
  const [itemLabours, setItemLabours] = useState<Record<number, MasterLabour[]>>({});
  const [isLoadingMasterData, setIsLoadingMasterData] = useState(false);

  // Search/dropdown states
  const [itemSearchTerms, setItemSearchTerms] = useState<Record<number, string>>({});
  const [itemDropdownOpen, setItemDropdownOpen] = useState<Record<number, boolean>>({});
  const [loadingItemData, setLoadingItemData] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (boq && boq.boq_id) {
      fetchBOQDetails();
      loadMasterItems();
    }
  }, [boq]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.item-dropdown-container')) {
        setItemDropdownOpen({});
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const loadMasterItems = async () => {
    setIsLoadingMasterData(true);
    try {
      const itemsData = await estimatorService.getAllItems();
      setMasterItems(itemsData);
    } catch (error) {
      console.error('Failed to load master items');
    } finally {
      setIsLoadingMasterData(false);
    }
  };

  const loadItemMaterials = async (itemId: number) => {
    try {
      const materials = await estimatorService.getItemMaterials(itemId);
      setItemMaterials(prev => ({ ...prev, [itemId]: materials }));
      return materials;
    } catch (error) {
      console.error('Failed to load materials for item:', error);
      return [];
    }
  };

  const loadItemLabours = async (itemId: number) => {
    try {
      const labours = await estimatorService.getItemLabours(itemId);
      setItemLabours(prev => ({ ...prev, [itemId]: labours }));
      return labours;
    } catch (error) {
      console.error('Failed to load labours for item:', error);
      return [];
    }
  };

  const getFilteredItems = (searchTerm: string) => {
    if (!searchTerm || searchTerm.trim() === '') {
      // Show all items when search is empty
      return masterItems.slice(0, 10);
    }
    const term = searchTerm.toLowerCase();
    return masterItems.filter(item =>
      item.item_name.toLowerCase().includes(term)
    ).slice(0, 10);
  };

  const handleItemNameChange = (itemIndex: number, value: string) => {
    setItemSearchTerms(prev => ({ ...prev, [itemIndex]: value }));

    // Always update item name in real-time
    handleItemChange(itemIndex, 'item_name', value);

    // Open dropdown if there's text and show suggestions
    if (value.trim().length > 0) {
      setItemDropdownOpen(prev => ({ ...prev, [itemIndex]: true }));
    } else {
      setItemDropdownOpen(prev => ({ ...prev, [itemIndex]: false }));
    }
  };

  const selectMasterItem = async (itemIndex: number, masterItem: MasterItem) => {
    setLoadingItemData(prev => ({ ...prev, [itemIndex]: true }));

    try {
      // Load materials and labour for this item
      const [materials, labours] = await Promise.all([
        loadItemMaterials(masterItem.item_id),
        loadItemLabours(masterItem.item_id)
      ]);

      // Update the item with master data
      const updatedItems = [...(editedBoq?.items || [])];
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        item_id: masterItem.item_id,
        item_name: masterItem.item_name,
        description: masterItem.description || updatedItems[itemIndex].description,
        overhead_percentage: masterItem.default_overhead_percentage || updatedItems[itemIndex].overhead_percentage,
        profit_margin_percentage: masterItem.default_profit_percentage || updatedItems[itemIndex].profit_margin_percentage,
        materials: materials.map(mat => ({
          material_id: mat.material_id,
          material_name: mat.material_name,
          quantity: 1,
          unit: mat.default_unit,
          unit_price: mat.current_market_price,
          total_price: mat.current_market_price,
          is_from_master: true
        })),
        labour: labours.map(lab => ({
          labour_id: lab.labour_id,
          labour_role: lab.labour_role,
          hours: 8,
          rate_per_hour: lab.amount / 8,
          total_cost: lab.amount,
          work_type: lab.work_type || 'contract',
          is_from_master: true
        }))
      };

      if (editedBoq) {
        setEditedBoq({
          ...editedBoq,
          items: updatedItems
        });
      }

      // Close dropdown
      setItemDropdownOpen(prev => ({ ...prev, [itemIndex]: false }));
      setItemSearchTerms(prev => ({ ...prev, [itemIndex]: masterItem.item_name }));
    } catch (error) {
      toast.error('Failed to load item details');
    } finally {
      setLoadingItemData(prev => ({ ...prev, [itemIndex]: false }));
    }
  };

  const fetchBOQDetails = async () => {
    if (!boq?.boq_id) return;

    setIsLoading(true);
    try {
      const response = await estimatorService.getBOQById(boq.boq_id);
      if (response.success && response.data) {
        setOriginalBoq(response.data);

        // Get items from correct location (existing_purchase.items OR items)
        const items = (response.data.existing_purchase?.items || response.data.items) || [];

        // Convert to editable format
        const editableBoq: BOQUpdatePayload = {
          project_id: response.data.project_id,
          boq_id: response.data.boq_id,
          boq_name: response.data.boq_name || boq.boq_name || boq.title || '',
          status: response.data.status,
          items: items.map((item: BOQItemDetailed) => ({
            item_id: item.master_item_id,
            item_name: item.item_name,
            description: item.description || '',
            work_type: item.work_type || 'contract',
            overhead_percentage: item.overhead_percentage || 8,
            profit_margin_percentage: item.profit_margin_percentage || 12,
            discount_percentage: (item as any).discount_percentage || 0,
            vat_percentage: (item as any).vat_percentage || 0,
            status: 'Active',
            materials: (item.materials || []).map(mat => ({
              material_id: mat.master_material_id,
              material_name: mat.material_name,
              description: mat.description || '',
              quantity: mat.quantity,
              unit: mat.unit,
              unit_price: mat.unit_price,
              total_price: mat.total_price || (mat.quantity * mat.unit_price),
              vat_percentage: mat.vat_percentage || 0
            })),
            labour: (item.labour || []).map(lab => ({
              labour_id: lab.master_labour_id,
              labour_role: lab.labour_role,
              hours: lab.hours,
              rate_per_hour: lab.rate_per_hour,
              total_cost: lab.total_cost || (lab.hours * lab.rate_per_hour),
              work_type: lab.work_type || 'contract'
            }))
          }))
        };

        setEditedBoq(editableBoq);

        // Initialize search terms with item names
        const initialSearchTerms: Record<number, string> = {};
        editableBoq.items.forEach((item, index) => {
          initialSearchTerms[index] = item.item_name;
        });
        setItemSearchTerms(initialSearchTerms);

        // Initialize useMaterialVAT based on whether materials have VAT percentages
        const initialVATMode: Record<number, boolean> = {};
        editableBoq.items.forEach((item, index) => {
          // Check if any material has a VAT percentage > 0
          const hasMaterialVAT = item.materials?.some(mat => (mat as any).vat_percentage > 0);
          initialVATMode[index] = hasMaterialVAT || false;
        });
        setUseMaterialVAT(initialVATMode);

        // Expand first item by default
        if (editableBoq.items.length > 0) {
          setExpandedItems(new Set([0]));
        }
      }
    } catch (error) {
      console.error('Error fetching BOQ details:', error);
      toast.error('Failed to load BOQ details');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !editedBoq) return null;

  const toggleItemExpansion = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  const handleItemChange = (itemIndex: number, field: string, value: any) => {
    const updatedItems = [...editedBoq.items];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      [field]: value
    };
    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const handleMaterialChange = (itemIndex: number, materialIndex: number, field: string, value: any) => {
    const updatedItems = [...editedBoq.items];
    const updatedMaterials = [...updatedItems[itemIndex].materials];

    updatedMaterials[materialIndex] = {
      ...updatedMaterials[materialIndex],
      [field]: value
    };

    // Recalculate total_price if quantity or unit_price changed
    if (field === 'quantity' || field === 'unit_price') {
      updatedMaterials[materialIndex].total_price =
        updatedMaterials[materialIndex].quantity * updatedMaterials[materialIndex].unit_price;
    }

    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      materials: updatedMaterials
    };

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const handleLabourChange = (itemIndex: number, labourIndex: number, field: string, value: any) => {
    const updatedItems = [...editedBoq.items];
    const updatedLabour = [...updatedItems[itemIndex].labour];

    updatedLabour[labourIndex] = {
      ...updatedLabour[labourIndex],
      [field]: value
    };

    // Recalculate total_cost if hours or rate_per_hour changed
    if (field === 'hours' || field === 'rate_per_hour') {
      updatedLabour[labourIndex].total_cost =
        updatedLabour[labourIndex].hours * updatedLabour[labourIndex].rate_per_hour;
    }

    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      labour: updatedLabour
    };

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const addItem = () => {
    const newItem = {
      item_name: '',
      description: '',
      overhead_percentage: 8,
      profit_margin_percentage: 12,
      discount_percentage: 0,
      status: 'Active',
      work_type: 'contract' as WorkType,
      materials: [],
      labour: []
    };

    setEditedBoq(prev => {
      const newIndex = prev.items.length; // Add at the end
      return {
        ...prev,
        items: [...prev.items, newItem] // Add new item at the end
      };
    });

    // Expand the new item
    setExpandedItems(prev => {
      const newIndex = editedBoq.items.length; // The index after adding
      return new Set([...prev, newIndex]);
    });

    // Clear search term for new item and open dropdown
    const newIndex = editedBoq.items.length;
    setItemSearchTerms(prev => ({ ...prev, [newIndex]: '' }));
    setItemDropdownOpen(prev => ({ ...prev, [newIndex]: false }));

    // Focus on the new item input after a short delay
    setTimeout(() => {
      const inputElement = document.querySelector(`input[data-item-index="${newIndex}"]`) as HTMLInputElement;
      if (inputElement) {
        inputElement.focus();
      }
    }, 100);
  };

  const removeItem = (itemIndex: number) => {
    const updatedItems = editedBoq.items.filter((_, index) => index !== itemIndex);

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });

    // Update expanded items - shift down indexes
    const newExpandedItems = new Set<number>();
    expandedItems.forEach(index => {
      if (index < itemIndex) {
        newExpandedItems.add(index);
      } else if (index > itemIndex) {
        newExpandedItems.add(index - 1);
      }
    });
    setExpandedItems(newExpandedItems);

    // Update search terms - reindex
    const newSearchTerms: Record<number, string> = {};
    Object.entries(itemSearchTerms).forEach(([key, value]) => {
      const index = parseInt(key);
      if (index < itemIndex) {
        newSearchTerms[index] = value;
      } else if (index > itemIndex) {
        newSearchTerms[index - 1] = value;
      }
    });
    setItemSearchTerms(newSearchTerms);

    // Close all dropdowns
    setItemDropdownOpen({});
  };

  const addMaterial = (itemIndex: number) => {
    const updatedItems = [...editedBoq.items];
    updatedItems[itemIndex].materials.push({
      material_name: 'New Material',
      quantity: 1,
      unit: 'nos',
      unit_price: 0,
      total_price: 0
    });

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const removeMaterial = (itemIndex: number, materialIndex: number) => {
    const updatedItems = [...editedBoq.items];
    updatedItems[itemIndex].materials = updatedItems[itemIndex].materials.filter(
      (_, index) => index !== materialIndex
    );

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const addLabour = (itemIndex: number) => {
    const updatedItems = [...editedBoq.items];
    updatedItems[itemIndex].labour.push({
      labour_role: 'Worker',
      hours: 8,
      rate_per_hour: 100,
      total_cost: 800,
      work_type: 'contract'
    });

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const removeLabour = (itemIndex: number, labourIndex: number) => {
    const updatedItems = [...editedBoq.items];
    updatedItems[itemIndex].labour = updatedItems[itemIndex].labour.filter(
      (_, index) => index !== labourIndex
    );

    setEditedBoq({
      ...editedBoq,
      items: updatedItems
    });
  };

  const calculateItemTotals = (item: any, itemIndex?: number) => {
    const materialTotal = item.materials.reduce((sum: number, mat: any) => sum + (mat.total_price || 0), 0);
    const labourTotal = item.labour.reduce((sum: number, lab: any) => sum + (lab.total_cost || 0), 0);
    const baseTotal = materialTotal + labourTotal;
    const overheadAmount = baseTotal * (item.overhead_percentage || 0) / 100;
    const profitAmount = baseTotal * (item.profit_margin_percentage || 0) / 100;
    const subtotal = baseTotal + overheadAmount + profitAmount;
    const discountAmount = subtotal * (item.discount_percentage || 0) / 100;
    const afterDiscount = subtotal - discountAmount;

    // Calculate VAT based on mode
    let vatAmount = 0;
    const itemIdx = itemIndex !== undefined ? itemIndex : editedBoq?.items.findIndex(i => i === item) ?? -1;

    if (itemIdx >= 0 && useMaterialVAT[itemIdx]) {
      // Per-material VAT mode: Calculate VAT for each material separately
      vatAmount = item.materials.reduce((sum: number, mat: any) => {
        const materialTotalPrice = mat.total_price || 0;
        const materialVAT = materialTotalPrice * ((mat.vat_percentage || 0) / 100);
        return sum + materialVAT;
      }, 0);
    } else {
      // Item-level VAT mode: Apply single VAT to after-discount amount
      vatAmount = afterDiscount * (item.vat_percentage || 0) / 100;
    }

    const sellingPrice = afterDiscount + vatAmount;

    return {
      materialTotal,
      labourTotal,
      baseTotal,
      overheadAmount,
      profitAmount,
      discountAmount,
      vatAmount,
      sellingPrice
    };
  };

  const calculateGrandTotal = () => {
    return editedBoq.items.reduce((total, item, index) => {
      const itemTotals = calculateItemTotals(item, index);
      return total + itemTotals.sellingPrice;
    }, 0);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (!editedBoq.boq_id) {
        toast.error('BOQ ID is missing');
        return;
      }

      // Add is_revision flag to the payload if this is a revision edit
      const payload = {
        ...editedBoq,
        is_revision: isRevision
      };

      // Service layer handles total_price and total_cost calculation
      const result = await estimatorService.updateBOQ(editedBoq.boq_id, payload);

      if (result.success) {
        toast.success('BOQ updated successfully');
        onSave();
        onClose();
      } else {
        toast.error(result.message || 'Failed to update BOQ');
      }
    } catch (error) {
      toast.error('Failed to save BOQ changes');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header - Match TD Style */}
          <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b border-blue-100 px-6 py-5 flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-md">
                <FileText className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#243d8a]">Edit BOQ</h2>
                <p className="text-sm text-gray-600 mt-1">Update Bill of Quantities for your project</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isSaving}
              aria-label="Close dialog"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" />
                  <p className="text-gray-600">Loading BOQ details...</p>
                </div>
              </div>
            ) : (
              <>
                {/* BOQ Details */}
                <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-xl p-5 mb-6 border border-blue-100">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    BOQ Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        BOQ Name *
                      </label>
                      <input
                        type="text"
                        value={editedBoq.boq_name}
                        onChange={(e) => setEditedBoq({ ...editedBoq, boq_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter BOQ name"
                        disabled={isSaving}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Total Project Value
                      </label>
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-semibold">
                        ₹{calculateGrandTotal().toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* BOQ Items - Match TD Style */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-900">BOQ Items</h3>
                    <div className="flex items-center gap-3">
                      {isLoadingMasterData && (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Loading master data...</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={addItem}
                        className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:opacity-90 transition-all font-semibold shadow-md"
                        style={{ backgroundColor: 'rgb(36, 61, 138)' }}
                        disabled={isSaving}
                      >
                        <Plus className="w-5 h-5" />
                        Add Item
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">

                    {editedBoq.items.map((item, itemIndex) => {
                      const totals = calculateItemTotals(item, itemIndex);
                      const isExpanded = expandedItems.has(itemIndex);

                      return (
                        <div key={itemIndex} className="border border-gray-200 rounded-lg">
                          {/* Item Header */}
                          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <button
                                type="button"
                                onClick={() => toggleItemExpansion(itemIndex)}
                                className="p-1 hover:bg-gray-200 rounded"
                                disabled={isSaving}
                                aria-label="Toggle item details"
                              >
                                {expandedItems.has(itemIndex) ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                              <span className="text-sm font-medium text-gray-700">Item #{itemIndex + 1}</span>
                              {item.item_id && (
                                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                                  From Master
                                </span>
                              )}
                              <div className="flex-1 relative item-dropdown-container">
                                <div className="relative">
                                  <input
                                    type="text"
                                    data-item-index={itemIndex}
                                    value={itemSearchTerms[itemIndex] !== undefined ? itemSearchTerms[itemIndex] : item.item_name}
                                    onChange={(e) => handleItemNameChange(itemIndex, e.target.value)}
                                    className="w-full px-2 py-1 pr-8 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Search master items or type new item name"
                                    disabled={isSaving || loadingItemData[itemIndex]}
                                    onFocus={() => {
                                      setItemDropdownOpen(prev => ({ ...prev, [itemIndex]: true }));
                                    }}
                                  />
                                  {loadingItemData[itemIndex] ? (
                                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 animate-spin" />
                                  ) : (
                                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                                  )}
                                  {itemDropdownOpen[itemIndex] && (
                                    <div className="absolute z-[20] w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                                      {(() => {
                                        const searchTerm = itemSearchTerms[itemIndex] !== undefined ? itemSearchTerms[itemIndex] : item.item_name;
                                        const filtered = getFilteredItems(searchTerm);
                                        const currentSearchTerm = itemSearchTerms[itemIndex] || '';
                                        const showNewOption = currentSearchTerm.trim().length > 0 &&
                                          !filtered.some(i => i.item_name.toLowerCase() === currentSearchTerm.toLowerCase());

                                        if (filtered.length === 0 && !showNewOption) {
                                          return (
                                            <div className="px-3 py-2 text-sm text-gray-500">
                                              Type to search items or add new
                                            </div>
                                          );
                                        }

                                        return (
                                          <>
                                            {filtered.map(masterItem => (
                                              <button
                                                key={masterItem.item_id}
                                                type="button"
                                                onClick={() => selectMasterItem(itemIndex, masterItem)}
                                                className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors flex items-center justify-between group"
                                              >
                                                <div>
                                                  <div className="font-medium text-gray-900">{masterItem.item_name}</div>
                                                  {masterItem.description && (
                                                    <div className="text-xs text-gray-500 truncate">{masterItem.description}</div>
                                                  )}
                                                </div>
                                                <span className="text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                  Select
                                                </span>
                                              </button>
                                            ))}
                                            {showNewOption && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  handleItemChange(itemIndex, 'item_name', itemSearchTerms[itemIndex]);
                                                  setItemDropdownOpen(prev => ({ ...prev, [itemIndex]: false }));
                                                }}
                                                className="w-full px-3 py-2 text-left text-sm bg-green-50 hover:bg-green-100 transition-colors border-t border-gray-200"
                                              >
                                                <div className="flex items-center gap-2">
                                                  <PlusCircle className="w-4 h-4 text-green-600" />
                                                  <span className="font-medium text-green-700">
                                                    Add "{itemSearchTerms[itemIndex]}" as new item
                                                  </span>
                                                </div>
                                              </button>
                                            )}
                                          </>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <input
                                type="text"
                                value={item.description}
                                onChange={(e) => handleItemChange(itemIndex, 'description', e.target.value)}
                                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                                placeholder="Description (optional)"
                                disabled={isSaving}
                              />
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              <span className="text-sm font-medium text-gray-900">
                                ₹{totals.sellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeItem(itemIndex)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded"
                                disabled={isSaving}
                                aria-label="Remove item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Item Details (Expandable) */}
                          {expandedItems.has(itemIndex) && (
                            <div className="p-4 space-y-4 bg-gray-50/50">
                              {/* Sub Items Section */}
                              <div className="bg-gradient-to-r from-blue-50 to-blue-100/30 rounded-lg p-4 border border-blue-200">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                                    <div className="p-1.5 bg-white rounded shadow-sm">
                                      <Package className="w-4 h-4 text-blue-600" />
                                    </div>
                                    Sub Items
                                  </h4>
                                  <button
                                    type="button"
                                    onClick={() => addMaterial(itemIndex)}
                                    className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                                    disabled={isSaving}
                                  >
                                    + Add Material
                                  </button>
                                </div>

                                {/* VAT Mode Toggle */}
                                <div className="mb-3 pb-3 border-b border-blue-200">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={useMaterialVAT[itemIndex] || false}
                                      onChange={(e) => {
                                        setUseMaterialVAT(prev => ({
                                          ...prev,
                                          [itemIndex]: e.target.checked
                                        }));
                                      }}
                                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                      disabled={isSaving}
                                    />
                                    <span className="text-xs text-blue-900 font-medium">
                                      Different VAT rates for materials
                                    </span>
                                    <span className="text-xs text-blue-600 italic">
                                      (Check this if materials have different VAT percentages)
                                    </span>
                                  </label>
                                </div>

                                {item.materials.length === 0 ? (
                                  <div className="text-center py-4 text-blue-700 bg-blue-50 rounded-lg border border-blue-200">
                                    No materials added yet
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto bg-white rounded-lg">
                                    <table className="w-full">
                                      <thead className="bg-blue-100 border-b border-blue-200">
                                        <tr>
                                          <th className="text-left p-3 text-xs font-bold text-blue-900">Material</th>
                                          <th className="text-left p-3 text-xs font-bold text-blue-900">Qty</th>
                                          <th className="text-left p-3 text-xs font-bold text-blue-900">Unit</th>
                                          <th className="text-left p-3 text-xs font-bold text-blue-900">Rate</th>
                                          <th className="text-left p-3 text-xs font-bold text-blue-900">Total</th>
                                          <th className="text-left p-3 text-xs font-bold text-blue-900"></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.materials.map((material, matIndex) => (
                                          <tr key={matIndex} className="border-t border-gray-100">
                                            <td className="p-2">
                                              <input
                                                type="text"
                                                value={material.material_name}
                                                onChange={(e) => handleMaterialChange(itemIndex, matIndex, 'material_name', e.target.value)}
                                                className={`w-full px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-2 ${
                                                  material.is_from_master
                                                    ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                                                    : 'border-gray-300 bg-white focus:ring-blue-500 focus:border-blue-500'
                                                }`}
                                                disabled={material.is_from_master}
                                                placeholder="Material name"
                                                title={material.is_from_master ? 'Material from master data cannot be edited' : ''}
                                              />
                                              <input
                                                type="text"
                                                value={(material as any).description || ''}
                                                onChange={(e) => handleMaterialChange(itemIndex, matIndex, 'description', e.target.value)}
                                                className="w-full px-3 py-1.5 mt-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                                placeholder="Description (optional)"
                                              />
                                              {useMaterialVAT[itemIndex] && (
                                                <div className="flex items-center gap-1 mt-1">
                                                  <span className="text-xs text-blue-700 font-medium">VAT:</span>
                                                  <input
                                                    type="number"
                                                    value={(material as any).vat_percentage === 0 ? '' : (material as any).vat_percentage || ''}
                                                    onChange={(e) => {
                                                      const value = e.target.value === '' ? 0 : Number(e.target.value);
                                                      handleMaterialChange(itemIndex, matIndex, 'vat_percentage', value);
                                                    }}
                                                    className="w-16 px-2 py-1 text-xs border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white"
                                                    placeholder="0"
                                                    min="0"
                                                    step="0.1"
                                                    disabled={isSaving}
                                                  />
                                                  <span className="text-xs text-gray-600">%</span>
                                                </div>
                                              )}
                                            </td>
                                            <td className="p-2">
                                              <div className="relative">
                                                <input
                                                  type="number"
                                                  value={material.quantity}
                                                  onChange={(e) => handleMaterialChange(itemIndex, matIndex, 'quantity', Number(e.target.value))}
                                                  className="w-24 px-3 py-1.5 pr-9 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                  placeholder="1"
                                                />
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleMaterialChange(itemIndex, matIndex, 'quantity', material.quantity + 1)}
                                                    className="px-1 hover:bg-blue-100 rounded text-blue-600"
                                                  >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                    </svg>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleMaterialChange(itemIndex, matIndex, 'quantity', Math.max(0, material.quantity - 1))}
                                                    className="px-1 hover:bg-blue-100 rounded text-blue-600"
                                                  >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                  </button>
                                                </div>
                                              </div>
                                            </td>
                                            <td className="p-2">
                                              <ModernSelect
                                                value={material.unit}
                                                onChange={(value) => handleMaterialChange(itemIndex, matIndex, 'unit', value)}
                                                options={UNIT_OPTIONS}
                                                className="w-28"
                                              />
                                            </td>
                                            <td className="p-2">
                                              <div className="flex items-center gap-1">
                                                <span className="text-sm text-gray-500 font-medium">AED</span>
                                                <div className="relative">
                                                  <input
                                                    type="number"
                                                    value={material.unit_price}
                                                    onChange={(e) => handleMaterialChange(itemIndex, matIndex, 'unit_price', Number(e.target.value))}
                                                    className="w-28 px-3 py-1.5 pr-9 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    placeholder="0.00"
                                                  />
                                                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
                                                    <button
                                                      type="button"
                                                      onClick={() => handleMaterialChange(itemIndex, matIndex, 'unit_price', material.unit_price + 10)}
                                                      className="px-1 hover:bg-blue-100 rounded text-blue-600"
                                                    >
                                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                      </svg>
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => handleMaterialChange(itemIndex, matIndex, 'unit_price', Math.max(0, material.unit_price - 10))}
                                                      className="px-1 hover:bg-blue-100 rounded text-blue-600"
                                                    >
                                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                      </svg>
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                            </td>
                                            <td className="p-2">
                                              <span className="font-medium">AED {material.total_price.toLocaleString()}</span>
                                            </td>
                                            <td className="p-2">
                                              <button
                                                onClick={() => removeMaterial(itemIndex, matIndex)}
                                                className="p-1 text-red-600 hover:bg-red-100 rounded"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              {/* Labour Section - Orange Card */}
                              <div className="bg-gradient-to-r from-orange-50 to-orange-100/30 rounded-lg p-4 border border-orange-200">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-sm font-bold text-orange-900 flex items-center gap-2">
                                    <div className="p-1.5 bg-white rounded shadow-sm">
                                      <Users className="w-4 h-4 text-orange-600" />
                                    </div>
                                    Labour
                                  </h4>
                                  <button
                                    type="button"
                                    onClick={() => addLabour(itemIndex)}
                                    className="text-xs font-semibold text-orange-700 hover:text-orange-800"
                                    disabled={isSaving}
                                  >
                                    + Add Labour
                                  </button>
                                </div>

                                {item.labour.length === 0 ? (
                                  <div className="text-center py-4 text-orange-700 bg-orange-50 rounded-lg border border-orange-200">
                                    No labour added yet
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto bg-white rounded-lg">
                                    <table className="w-full">
                                      <thead className="bg-orange-100 border-b border-orange-200">
                                        <tr>
                                          <th className="text-left p-3 text-xs font-bold text-orange-900">Role</th>
                                          <th className="text-left p-3 text-xs font-bold text-orange-900">Hours</th>
                                          <th className="text-left p-3 text-xs font-bold text-orange-900">Rate/Hr</th>
                                          <th className="text-left p-3 text-xs font-bold text-orange-900">Type</th>
                                          <th className="text-left p-3 text-xs font-bold text-orange-900">Total</th>
                                          <th className="text-left p-3 text-xs font-bold text-orange-900"></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.labour.map((labour, labIndex) => (
                                          <tr key={labIndex} className="border-t border-gray-100">
                                            <td className="p-2">
                                              <input
                                                type="text"
                                                value={labour.labour_role}
                                                onChange={(e) => handleLabourChange(itemIndex, labIndex, 'labour_role', e.target.value)}
                                                className={`w-full px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-2 ${
                                                  labour.is_from_master
                                                    ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                                                    : 'border-gray-300 bg-white focus:ring-blue-500 focus:border-blue-500'
                                                }`}
                                                disabled={labour.is_from_master}
                                                placeholder="Labour role"
                                                title={labour.is_from_master ? 'Labour role from master data cannot be edited' : ''}
                                              />
                                            </td>
                                            <td className="p-2">
                                              <div className="relative">
                                                <input
                                                  type="number"
                                                  value={labour.hours}
                                                  onChange={(e) => handleLabourChange(itemIndex, labIndex, 'hours', Number(e.target.value))}
                                                  className="w-24 px-3 py-1.5 pr-9 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                  placeholder="8"
                                                />
                                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleLabourChange(itemIndex, labIndex, 'hours', labour.hours + 1)}
                                                    className="px-1 hover:bg-orange-100 rounded text-orange-600"
                                                  >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                    </svg>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleLabourChange(itemIndex, labIndex, 'hours', Math.max(0, labour.hours - 1))}
                                                    className="px-1 hover:bg-orange-100 rounded text-orange-600"
                                                  >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                  </button>
                                                </div>
                                              </div>
                                            </td>
                                            <td className="p-2">
                                              <div className="flex items-center gap-1">
                                                <span className="text-sm text-gray-500 font-medium">AED</span>
                                                <div className="relative">
                                                  <input
                                                    type="number"
                                                    value={labour.rate_per_hour}
                                                    onChange={(e) => handleLabourChange(itemIndex, labIndex, 'rate_per_hour', Number(e.target.value))}
                                                    className="w-28 px-3 py-1.5 pr-9 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    placeholder="0.00"
                                                  />
                                                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
                                                    <button
                                                      type="button"
                                                      onClick={() => handleLabourChange(itemIndex, labIndex, 'rate_per_hour', labour.rate_per_hour + 10)}
                                                      className="px-1 hover:bg-orange-100 rounded text-orange-600"
                                                    >
                                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                      </svg>
                                                    </button>
                                                    <button
                                                      type="button"
                                                      onClick={() => handleLabourChange(itemIndex, labIndex, 'rate_per_hour', Math.max(0, labour.rate_per_hour - 10))}
                                                      className="px-1 hover:bg-orange-100 rounded text-orange-600"
                                                    >
                                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                      </svg>
                                                    </button>
                                                  </div>
                                                </div>
                                              </div>
                                            </td>
                                            <td className="p-2">
                                              <select
                                                value={labour.work_type}
                                                onChange={(e) => handleLabourChange(itemIndex, labIndex, 'work_type', e.target.value)}
                                                className="px-3 py-1.5 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 bg-white text-sm"
                                              >
                                                <option value="contract">Contract</option>
                                                <option value="daily_wages">Daily</option>
                                                <option value="piece_rate">Piece</option>
                                              </select>
                                            </td>
                                            <td className="p-2">
                                              <span className="font-medium">AED {labour.total_cost.toLocaleString()}</span>
                                            </td>
                                            <td className="p-2">
                                              <button
                                                onClick={() => removeLabour(itemIndex, labIndex)}
                                                className="p-1 text-red-600 hover:bg-red-100 rounded"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              {/* Overheads, Profit & Discount Section */}
                              <div className="bg-gradient-to-r from-green-50 to-green-100/30 rounded-lg p-4 border border-green-200">
                                <h5 className="text-sm font-bold text-green-900 mb-3 flex items-center gap-2">
                                  <div className="p-1.5 bg-white rounded shadow-sm">
                                    <Calculator className="w-4 h-4 text-green-600" />
                                  </div>
                                  Overheads, Profit, Discount & VAT
                                </h5>
                                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${useMaterialVAT[itemIndex] ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
                                  <div>
                                    <label className="block text-xs font-semibold text-green-900 mb-2">
                                      Overhead (%)
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        value={item.overhead_percentage}
                                        onChange={(e) => handleItemChange(itemIndex, 'overhead_percentage', Number(e.target.value))}
                                        className="flex-1 px-3 py-2 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                                        step="0.1"
                                        disabled={isSaving}
                                        placeholder="10"
                                      />
                                      <span className="text-sm text-gray-500">%</span>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-green-900 mb-2">
                                      Profit (%)
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        value={item.profit_margin_percentage}
                                        onChange={(e) => handleItemChange(itemIndex, 'profit_margin_percentage', Number(e.target.value))}
                                        className="flex-1 px-3 py-2 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                                        step="0.1"
                                        disabled={isSaving}
                                        placeholder="15"
                                      />
                                      <span className="text-sm text-gray-500">%</span>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-green-900 mb-2">
                                      Discount (%)
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        value={item.discount_percentage || 0}
                                        onChange={(e) => handleItemChange(itemIndex, 'discount_percentage', Number(e.target.value))}
                                        className="flex-1 px-3 py-2 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                                        step="0.1"
                                        disabled={isSaving}
                                        placeholder="0"
                                        min="0"
                                        max="100"
                                      />
                                      <span className="text-sm text-gray-500">%</span>
                                    </div>
                                  </div>
                                  {!useMaterialVAT[itemIndex] && (
                                    <div>
                                      <label className="block text-xs font-semibold text-green-900 mb-2">
                                        VAT (%)
                                      </label>
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="number"
                                          value={(item as any).vat_percentage || 0}
                                          onChange={(e) => handleItemChange(itemIndex, 'vat_percentage', Number(e.target.value))}
                                          className="flex-1 px-3 py-2 border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                                          step="0.1"
                                          disabled={isSaving}
                                          placeholder="5"
                                          min="0"
                                        />
                                        <span className="text-sm text-gray-500">%</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Cost Summary - Neutral like PM */}
                              <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                                <h5 className="text-sm font-bold text-gray-900 mb-3">Cost Summary</h5>
                                <div className="space-y-1 text-xs">
                                  <div className="flex justify-between py-1">
                                    <span className="text-gray-600">Materials:</span>
                                    <span className="font-semibold text-gray-900">AED {totals.materialTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                  </div>
                                  <div className="flex justify-between py-1">
                                    <span className="text-gray-600">Labour:</span>
                                    <span className="font-semibold text-gray-900">AED {totals.labourTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                  </div>
                                  <div className="flex justify-between py-1">
                                    <span className="text-gray-600">Overhead:</span>
                                    <span className="font-semibold text-gray-900">AED {totals.overheadAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                  </div>
                                  <div className="flex justify-between py-1">
                                    <span className="text-gray-600">Profit:</span>
                                    <span className="font-semibold text-gray-900">AED {totals.profitAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                  </div>
                                  {(item.discount_percentage || 0) > 0 && (
                                    <div className="flex justify-between py-1">
                                      <span className="text-red-600">Discount ({item.discount_percentage}%):</span>
                                      <span className="font-semibold text-red-600">- AED {totals.discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                  )}
                                  {((item as any).vat_percentage || 0) > 0 && (
                                    <div className="flex justify-between py-1">
                                      <span className="text-blue-600">VAT ({(item as any).vat_percentage}%):</span>
                                      <span className="font-semibold text-blue-600">+ AED {totals.vatAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between font-bold border-t border-gray-300 pt-2 mt-2">
                                    <span className="text-gray-900">Selling Price:</span>
                                    <span className="text-gray-900">AED {totals.sellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  {editedBoq.items.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50/50">
                      <FileText className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 font-medium">No items added yet</p>
                      <p className="text-sm text-gray-400 mt-1">Click "Add Item" to start building your BOQ</p>
                    </div>
                  )}
                </div>

                {/* Total Summary */}
                {editedBoq.items.length > 0 && (
                  <div className="mt-6 bg-gradient-to-r from-green-50 to-green-100 rounded-2xl p-5 border-2 border-green-300 shadow-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-br from-green-100 to-green-200 rounded-xl shadow-md">
                          <Calculator className="w-6 h-6 text-green-600" />
                        </div>
                        <h3 className="text-lg font-bold text-green-900">Total Project Value</h3>
                      </div>
                      <span className="text-3xl font-bold text-green-900">
                        AED {calculateGrandTotal().toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              </>
            )}
          </div>

          {/* Footer - Match TD Style */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-all font-semibold shadow-sm"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !editedBoq.boq_name || editedBoq.items.length === 0}
              className="flex items-center gap-2 px-6 py-2.5 text-white rounded-lg hover:opacity-90 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed font-bold shadow-lg"
              style={{ backgroundColor: isSaving || !editedBoq.boq_name || editedBoq.items.length === 0 ? '' : 'rgb(36, 61, 138)' }}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default BOQEditModal;