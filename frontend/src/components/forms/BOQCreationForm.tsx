import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Plus,
  Trash2,
  Save,
  FileText,
  Package,
  Users,
  Calculator,
  ChevronDown,
  ChevronRight,
  Upload,
  Loader2,
  Search,
  PlusCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import { ProjectOption, BOQMaterial, BOQLabour, BOQCreatePayload, WorkType } from '@/roles/estimator/types';

// Backend-aligned interfaces
interface BOQItemForm {
  id: string;
  item_name: string;
  description: string;
  work_type: WorkType;
  materials: BOQMaterialForm[];
  labour: BOQLabourForm[];
  overhead_percentage: number;
  profit_margin_percentage: number;
  master_item_id?: number; // Track if this is an existing item
  is_new?: boolean; // Track if this is a new item
}

interface BOQMaterialForm extends Omit<BOQMaterial, 'material_id' | 'total_price'> {
  id: string;
  master_material_id?: number; // Track if this is an existing material
  is_new?: boolean; // Track if this is a new material
  is_from_master?: boolean; // Track if selected from dropdown
}

interface BOQLabourForm extends Omit<BOQLabour, 'labour_id' | 'total_cost'> {
  id: string;
  master_labour_id?: number; // Track if this is an existing labour
  is_new?: boolean; // Track if this is a new labour
  is_from_master?: boolean; // Track if selected from dropdown
}

interface BOQCreationFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (boqId: number) => void;
  selectedProject?: any;
}

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

const BOQCreationForm: React.FC<BOQCreationFormProps> = ({ isOpen, onClose, onSubmit, selectedProject }) => {
  const [boqName, setBoqName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [items, setItems] = useState<BOQItemForm[]>([]);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [overallOverhead, setOverallOverhead] = useState(10);
  const [overallProfit, setOverallProfit] = useState(15);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  // Master data states
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [itemMaterials, setItemMaterials] = useState<Record<number, MasterMaterial[]>>({});
  const [itemLabours, setItemLabours] = useState<Record<number, MasterLabour[]>>({});
  const [isLoadingMasterData, setIsLoadingMasterData] = useState(false);

  // Search/dropdown states
  const [itemSearchTerms, setItemSearchTerms] = useState<Record<string, string>>({});
  const [itemDropdownOpen, setItemDropdownOpen] = useState<Record<string, boolean>>({});
  const [materialDropdownOpen, setMaterialDropdownOpen] = useState<Record<string, boolean>>({});
  const [labourDropdownOpen, setLabourDropdownOpen] = useState<Record<string, boolean>>({});
  const [loadingItemData, setLoadingItemData] = useState<Record<string, boolean>>({});

  // Load projects and master items on mount
  useEffect(() => {
    if (isOpen) {
      loadProjects();
      loadMasterItems();
    }
  }, [isOpen]);

  const loadProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const projectsData = await estimatorService.getProjects();
      setProjects(projectsData);
    } catch (error) {
      toast.error('Failed to load projects');
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const loadMasterItems = async () => {
    setIsLoadingMasterData(true);
    try {
      const itemsData = await estimatorService.getAllItems();
      setMasterItems(itemsData);
    } catch (error) {
      toast.error('Failed to load master items');
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

  // Reset form when closed
  useEffect(() => {
    if (!isOpen) {
      setBoqName('');
      setSelectedProjectId(null);
      setItems([]);
      setExpandedItems([]);
      setOverallOverhead(10);
      setOverallProfit(15);
      setIsSubmitting(false);
      setItemSearchTerms({});
      setItemDropdownOpen({});
      setMaterialDropdownOpen({});
      setLabourDropdownOpen({});
    }
  }, [isOpen]);

  // Auto-select project if provided
  useEffect(() => {
    if (selectedProject && isOpen) {
      setSelectedProjectId(selectedProject.project_id);
      setBoqName(`BOQ for ${selectedProject.project_name}`);
    }
  }, [selectedProject, isOpen]);

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

  const addItem = () => {
    const newItem: BOQItemForm = {
      id: Date.now().toString(),
      item_name: '',
      description: '',
      work_type: 'contract',
      materials: [],
      labour: [],
      overhead_percentage: overallOverhead,
      profit_margin_percentage: overallProfit,
      is_new: true
    };
    setItems([...items, newItem]);
    setExpandedItems([...expandedItems, newItem.id]);
    setItemSearchTerms(prev => ({ ...prev, [newItem.id]: '' }));
  };

  const selectMasterItem = async (itemId: string, masterItem: MasterItem) => {
    // Set loading state
    setLoadingItemData(prev => ({ ...prev, [itemId]: true }));

    try {
      // Load materials and labour for this item
      const [materials, labours] = await Promise.all([
        loadItemMaterials(masterItem.item_id),
        loadItemLabours(masterItem.item_id)
      ]);

    // Update the item with master data
    setItems(items.map(item => {
      if (item.id === itemId) {
        // Convert master materials to form materials
        const formMaterials: BOQMaterialForm[] = materials.map(mat => ({
          id: `mat-${mat.material_id}-${Date.now()}`,
          material_name: mat.material_name,
          quantity: 1,
          unit: mat.default_unit,
          unit_price: mat.current_market_price,
          master_material_id: mat.material_id,
          is_from_master: true
        }));

        // Convert master labours to form labours
        const formLabours: BOQLabourForm[] = labours.map(lab => ({
          id: `lab-${lab.labour_id}-${Date.now()}`,
          labour_role: lab.labour_role,
          hours: 8, // Default hours
          rate_per_hour: lab.amount / 8, // Calculate hourly rate from amount
          master_labour_id: lab.labour_id,
          is_from_master: true
        }));

        return {
          ...item,
          item_name: masterItem.item_name,
          description: masterItem.description || item.description,
          master_item_id: masterItem.item_id,
          overhead_percentage: masterItem.default_overhead_percentage || item.overhead_percentage,
          profit_margin_percentage: masterItem.default_profit_percentage || item.profit_margin_percentage,
          materials: formMaterials,
          labour: formLabours,
          is_new: false
        };
      }
      return item;
    }));

      // Close dropdown
      setItemDropdownOpen(prev => ({ ...prev, [itemId]: false }));
      setItemSearchTerms(prev => ({ ...prev, [itemId]: masterItem.item_name }));
    } catch (error) {
      toast.error('Failed to load item details');
    } finally {
      setLoadingItemData(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleItemNameChange = (itemId: string, value: string) => {
    setItemSearchTerms(prev => ({ ...prev, [itemId]: value }));

    // Update item name if it's a new item or if user is typing a custom name
    setItems(items.map(item => {
      if (item.id === itemId && item.is_new) {
        return { ...item, item_name: value, master_item_id: undefined };
      }
      return item;
    }));

    // Open dropdown if there's text
    if (value.trim()) {
      setItemDropdownOpen(prev => ({ ...prev, [itemId]: true }));
    } else {
      setItemDropdownOpen(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const getFilteredItems = (searchTerm: string) => {
    if (!searchTerm) return [];
    const term = searchTerm.toLowerCase();
    return masterItems.filter(item =>
      item.item_name.toLowerCase().includes(term)
    ).slice(0, 10); // Limit to 10 results
  };

  const removeItem = (itemId: string) => {
    setItems(items.filter(item => item.id !== itemId));
    setExpandedItems(expandedItems.filter(id => id !== itemId));
  };

  const toggleItemExpanded = (itemId: string) => {
    if (expandedItems.includes(itemId)) {
      setExpandedItems(expandedItems.filter(id => id !== itemId));
    } else {
      setExpandedItems([...expandedItems, itemId]);
    }
  };

  const updateItem = (itemId: string, field: keyof BOQItemForm, value: any) => {
    setItems(items.map(item =>
      item.id === itemId ? { ...item, [field]: value } : item
    ));
  };

  const addMaterial = (itemId: string) => {
    const newMaterial: BOQMaterialForm = {
      id: Date.now().toString(),
      material_name: '',
      quantity: 1,
      unit: 'nos',
      unit_price: 0,
      is_new: true
    };

    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, materials: [...item.materials, newMaterial] }
        : item
    ));
  };

  const removeMaterial = (itemId: string, materialId: string) => {
    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, materials: item.materials.filter(m => m.id !== materialId) }
        : item
    ));
  };

  const updateMaterial = (itemId: string, materialId: string, field: keyof BOQMaterialForm, value: any) => {
    setItems(items.map(item =>
      item.id === itemId
        ? {
            ...item,
            materials: item.materials.map(m =>
              m.id === materialId ? { ...m, [field]: value } : m
            )
          }
        : item
    ));
  };

  const addLabour = (itemId: string) => {
    const newLabour: BOQLabourForm = {
      id: Date.now().toString(),
      labour_role: '',
      hours: 1,
      rate_per_hour: 0,
      is_new: true
    };

    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, labour: [...item.labour, newLabour] }
        : item
    ));
  };

  const removeLabour = (itemId: string, labourId: string) => {
    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, labour: item.labour.filter(l => l.id !== labourId) }
        : item
    ));
  };

  const updateLabour = (itemId: string, labourId: string, field: keyof BOQLabourForm, value: any) => {
    setItems(items.map(item =>
      item.id === itemId
        ? {
            ...item,
            labour: item.labour.map(l =>
              l.id === labourId ? { ...l, [field]: value } : l
            )
          }
        : item
    ));
  };

  const calculateItemCost = (item: BOQItemForm) => {
    const materialCost = item.materials.reduce((sum, m) => sum + (m.quantity * m.unit_price), 0);
    const labourCost = item.labour.reduce((sum, l) => sum + (l.hours * l.rate_per_hour), 0);
    const baseCost = materialCost + labourCost;
    const overheadAmount = baseCost * (item.overhead_percentage / 100);
    const totalCost = baseCost + overheadAmount;
    const profitAmount = baseCost * (item.profit_margin_percentage / 100);
    const sellingPrice = totalCost + profitAmount;
    return {
      baseCost,
      materialCost,
      labourCost,
      overheadAmount,
      totalCost,
      profitAmount,
      sellingPrice
    };
  };

  const calculateTotalCost = () => {
    return items.reduce((sum, item) => sum + calculateItemCost(item).sellingPrice, 0);
  };

  const handleSubmit = async () => {
    if (!boqName.trim()) {
      toast.error('Please enter BOQ name');
      return;
    }

    if (!selectedProjectId) {
      toast.error('Please select a project');
      return;
    }

    if (items.length === 0) {
      toast.error('Please add at least one BOQ item');
      return;
    }

    // Validate items
    for (const item of items) {
      if (!item.item_name.trim()) {
        toast.error('Please fill in all item names');
        return;
      }
      if (item.materials.length === 0 && item.labour.length === 0) {
        toast.error('Each item must have at least one material or labour entry');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload: BOQCreatePayload = {
        project_id: selectedProjectId,
        boq_name: boqName,
        status: 'Draft',
        created_by: 'Estimator', // You can get this from auth context
        items: items.map(item => ({
          item_name: item.item_name,
          description: item.description || undefined,
          work_type: item.work_type,
          overhead_percentage: item.overhead_percentage,
          profit_margin_percentage: item.profit_margin_percentage,
          materials: item.materials.map(material => ({
            material_name: material.material_name,
            quantity: material.quantity,
            unit: material.unit,
            unit_price: material.unit_price
          })),
          labour: item.labour.map(labour => ({
            labour_role: labour.labour_role,
            hours: labour.hours,
            rate_per_hour: labour.rate_per_hour
          }))
        }))
      };

      const result = await estimatorService.createBOQ(payload);

      if (result.success && result.boq_id) {
        toast.success(result.message);
        if (onSubmit) {
          onSubmit(result.boq_id);
        }
        onClose();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to create BOQ');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200 px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-200 rounded-xl">
                <FileText className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-blue-900">Create New BOQ</h2>
                <p className="text-sm text-blue-700">Build a detailed Bill of Quantities for your project</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute top-5 right-6 p-2 text-gray-600 hover:bg-blue-200 rounded-lg transition-colors"
              disabled={isSubmitting}
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-140px)] p-6">
            {/* BOQ Details */}
            <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-xl p-6 mb-6 border border-blue-100">
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
                    value={boqName}
                    onChange={(e) => setBoqName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter BOQ name"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project *
                  </label>
                  {isLoadingProjects ? (
                    <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-gray-500">Loading projects...</span>
                    </div>
                  ) : selectedProject ? (
                    // Static display when project is pre-selected
                    <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 cursor-not-allowed">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700 font-medium">
                          {selectedProject.project_name} - {selectedProject.client || 'No Client'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  ) : (
                    <select
                      id="project-select"
                      value={selectedProjectId || ''}
                      onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      disabled={isSubmitting}
                      aria-label="Select project"
                    >
                      <option value="">Select a project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name} - {project.client}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              {selectedProjectId && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                  {(() => {
                    const selectedProject = projects.find(p => p.id.toString() === selectedProjectId.toString());
                    return selectedProject ? (
                      <div className="text-sm text-blue-800">
                        <strong>Selected:</strong> {selectedProject.name} | <strong>Client:</strong> {selectedProject.client} | <strong>Location:</strong> {selectedProject.location || 'N/A'}
                      </div>
                    ) : null;
                  })()
                  }
                </div>
              )}
            </div>

            {/* Default Overhead & Profit */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-semibold text-blue-900">Default Overhead & Profit</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="overhead-input" className="block text-sm text-blue-700 mb-1">Overhead %</label>
                  <input
                    id="overhead-input"
                    type="number"
                    value={overallOverhead}
                    onChange={(e) => setOverallOverhead(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isSubmitting}
                    placeholder="Enter overhead percentage"
                  />
                </div>
                <div>
                  <label htmlFor="profit-input" className="block text-sm text-blue-700 mb-1">Profit Margin %</label>
                  <input
                    id="profit-input"
                    type="number"
                    value={overallProfit}
                    onChange={(e) => setOverallProfit(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isSubmitting}
                    placeholder="Enter profit margin percentage"
                  />
                </div>
              </div>
            </div>

            {/* BOQ Items */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">BOQ Items</h3>
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
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    disabled={isSubmitting}
                  >
                    <Plus className="w-4 h-4" />
                    Add Item
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg">
                    {/* Item Header */}
                    <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleItemExpanded(item.id)}
                          className="p-1 hover:bg-gray-200 rounded"
                          disabled={isSubmitting}
                          aria-label="Toggle item details"
                        >
                          {expandedItems.includes(item.id) ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                        <span className="text-sm font-medium text-gray-700">Item #{index + 1}</span>
                        {item.master_item_id && (
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                            From Master
                          </span>
                        )}
                        {item.is_new && item.item_name && (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
                            New Item
                          </span>
                        )}
                        <div className="flex-1 relative item-dropdown-container">
                          <div className="relative">
                            <input
                              type="text"
                              value={itemSearchTerms[item.id] || item.item_name}
                              onChange={(e) => handleItemNameChange(item.id, e.target.value)}
                              className="w-full px-2 py-1 pr-8 text-sm border border-gray-300 rounded"
                              placeholder="Search or type new item name"
                              disabled={isSubmitting || loadingItemData[item.id]}
                              onFocus={() => setItemDropdownOpen(prev => ({ ...prev, [item.id]: true }))}
                            />
                            {loadingItemData[item.id] ? (
                              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 animate-spin" />
                            ) : (
                              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                            )}
                          </div>
                          {itemDropdownOpen[item.id] && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {(() => {
                                const filtered = getFilteredItems(itemSearchTerms[item.id] || '');
                                const showNewOption = itemSearchTerms[item.id] &&
                                  !filtered.some(i => i.item_name.toLowerCase() === itemSearchTerms[item.id].toLowerCase());

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
                                        onClick={() => selectMasterItem(item.id, masterItem)}
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
                                          updateItem(item.id, 'item_name', itemSearchTerms[item.id]);
                                          updateItem(item.id, 'is_new', true);
                                          setItemDropdownOpen(prev => ({ ...prev, [item.id]: false }));
                                        }}
                                        className="w-full px-3 py-2 text-left text-sm bg-green-50 hover:bg-green-100 transition-colors border-t border-gray-200"
                                      >
                                        <div className="flex items-center gap-2">
                                          <PlusCircle className="w-4 h-4 text-green-600" />
                                          <span className="font-medium text-green-700">
                                            Add "{itemSearchTerms[item.id]}" as new item
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
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                          placeholder="Description (optional)"
                          disabled={isSubmitting}
                        />
                        <select
                          value={item.work_type}
                          onChange={(e) => updateItem(item.id, 'work_type', e.target.value as WorkType)}
                          className="px-2 py-1 text-sm border border-gray-300 rounded"
                          disabled={isSubmitting}
                          aria-label="Work type"
                        >
                          <option value="contract">Contract</option>
                          <option value="daily_wages">Daily Wages</option>
                          <option value="piece_rate">Piece Rate</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-sm font-medium text-gray-900">
                          ₹{calculateItemCost(item).sellingPrice.toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                          disabled={isSubmitting}
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Item Details (Expandable) */}
                    {expandedItems.includes(item.id) && (
                      <div className="p-4 space-y-4">
                        {/* Materials Section */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                              <Package className="w-4 h-4" />
                              Raw Materials
                            </h4>
                            <button
                              type="button"
                              onClick={() => addMaterial(item.id)}
                              className="text-xs text-indigo-600 hover:text-indigo-700"
                              disabled={isSubmitting}
                            >
                              + Add Material
                            </button>
                          </div>
                          <div className="space-y-2">
                            {item.materials.map((material) => (
                              <div key={material.id} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={material.material_name}
                                  onChange={(e) => updateMaterial(item.id, material.id, 'material_name', e.target.value)}
                                  className={`flex-1 px-2 py-1 text-sm border rounded ${
                                    material.is_from_master
                                      ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                                      : 'border-gray-300'
                                  }`}
                                  placeholder="Material name"
                                  disabled={isSubmitting || material.is_from_master}
                                  title={material.is_from_master ? 'Material name from master data cannot be edited' : ''}
                                />
                                <input
                                  type="number"
                                  value={material.quantity}
                                  onChange={(e) => updateMaterial(item.id, material.id, 'quantity', Number(e.target.value))}
                                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                                  placeholder="Qty"
                                  min="0"
                                  step="0.01"
                                  disabled={isSubmitting}
                                />
                                <select
                                  value={material.unit}
                                  onChange={(e) => updateMaterial(item.id, material.id, 'unit', e.target.value)}
                                  className="px-2 py-1 text-sm border border-gray-300 rounded"
                                  disabled={isSubmitting}
                                  aria-label="Material unit"
                                >
                                  <option value="nos">Nos</option>
                                  <option value="kg">Kg</option>
                                  <option value="ltr">Ltr</option>
                                  <option value="mtr">Mtr</option>
                                  <option value="sqm">Sqm</option>
                                  <option value="cum">Cum</option>
                                </select>
                                <input
                                  type="number"
                                  value={material.unit_price}
                                  onChange={(e) => updateMaterial(item.id, material.id, 'unit_price', Number(e.target.value))}
                                  className="w-24 px-2 py-1 text-sm border border-gray-300 rounded"
                                  placeholder="Unit price"
                                  min="0"
                                  step="0.01"
                                  disabled={isSubmitting}
                                />
                                <span className="w-20 px-2 py-1 text-xs text-gray-600 bg-gray-50 rounded text-center">
                                  ₹{(material.quantity * material.unit_price).toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeMaterial(item.id, material.id)}
                                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                                  disabled={isSubmitting}
                                  aria-label="Remove material"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Labour Section */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              Labour
                            </h4>
                            <button
                              type="button"
                              onClick={() => addLabour(item.id)}
                              className="text-xs text-indigo-600 hover:text-indigo-700"
                              disabled={isSubmitting}
                            >
                              + Add Labour
                            </button>
                          </div>
                          <div className="space-y-2">
                            {item.labour.map((labour) => (
                              <div key={labour.id} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={labour.labour_role}
                                  onChange={(e) => updateLabour(item.id, labour.id, 'labour_role', e.target.value)}
                                  className={`flex-1 px-2 py-1 text-sm border rounded ${
                                    labour.is_from_master
                                      ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                                      : 'border-gray-300'
                                  }`}
                                  placeholder="Labour role (e.g., Fabricator, Installer)"
                                  disabled={isSubmitting || labour.is_from_master}
                                  title={labour.is_from_master ? 'Labour role from master data cannot be edited' : ''}
                                />
                                <input
                                  type="number"
                                  value={labour.hours}
                                  onChange={(e) => updateLabour(item.id, labour.id, 'hours', Number(e.target.value))}
                                  className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                                  placeholder="Hours"
                                  min="0"
                                  step="0.5"
                                  disabled={isSubmitting}
                                />
                                <input
                                  type="number"
                                  value={labour.rate_per_hour}
                                  onChange={(e) => updateLabour(item.id, labour.id, 'rate_per_hour', Number(e.target.value))}
                                  className="w-24 px-2 py-1 text-sm border border-gray-300 rounded"
                                  placeholder="Rate/hour"
                                  min="0"
                                  step="0.01"
                                  disabled={isSubmitting}
                                />
                                <span className="w-20 px-2 py-1 text-xs text-gray-600 bg-gray-50 rounded text-center">
                                  ₹{(labour.hours * labour.rate_per_hour).toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeLabour(item.id, labour.id)}
                                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                                  disabled={isSubmitting}
                                  aria-label="Remove labour"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Overhead & Profit for this item */}
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                          <div>
                            <label htmlFor={`overhead-${item.id}`} className="block text-xs text-gray-600 mb-1">Overhead %</label>
                            <input
                              id={`overhead-${item.id}`}
                              type="number"
                              value={item.overhead_percentage}
                              onChange={(e) => updateItem(item.id, 'overhead_percentage', Number(e.target.value))}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              min="0"
                              step="0.1"
                              disabled={isSubmitting}
                              placeholder="0"
                            />
                          </div>
                          <div>
                            <label htmlFor={`profit-${item.id}`} className="block text-xs text-gray-600 mb-1">Profit Margin %</label>
                            <input
                              id={`profit-${item.id}`}
                              type="number"
                              value={item.profit_margin_percentage}
                              onChange={(e) => updateItem(item.id, 'profit_margin_percentage', Number(e.target.value))}
                              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                              min="0"
                              step="0.1"
                              disabled={isSubmitting}
                              placeholder="0"
                            />
                          </div>
                        </div>

                        {/* Cost Breakdown */}
                        {(() => {
                          const costs = calculateItemCost(item);
                          return (
                            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                              <h5 className="text-xs font-medium text-gray-700 mb-2">Cost Breakdown</h5>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Materials:</span>
                                  <span className="font-medium">₹{costs.materialCost.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Labour:</span>
                                  <span className="font-medium">₹{costs.labourCost.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Base Cost:</span>
                                  <span className="font-medium">₹{costs.baseCost.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Overhead:</span>
                                  <span className="font-medium">₹{costs.overheadAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Total Cost:</span>
                                  <span className="font-medium">₹{costs.totalCost.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Profit:</span>
                                  <span className="font-medium">₹{costs.profitAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold border-t pt-1">
                                  <span className="text-gray-700">Selling Price:</span>
                                  <span className="text-green-600">₹{costs.sellingPrice.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {items.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500">No items added yet</p>
                  <p className="text-sm text-gray-400 mt-1">Click "Add Item" to start building your BOQ</p>
                </div>
              )}
            </div>

            {/* Total Summary */}
            {items.length > 0 && (
              <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-200 rounded-lg">
                      <Calculator className="w-5 h-5 text-green-600" />
                    </div>
                    <h3 className="text-lg font-bold text-green-900">Total Project Value</h3>
                  </div>
                  <span className="text-2xl font-bold text-green-900">
                    ₹{calculateTotalCost().toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <div className="flex items-center gap-3">
              <button type="button" className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium" disabled={isSubmitting}>
                <Upload className="w-4 h-4" />
                Import Template
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !boqName || !selectedProjectId || items.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating BOQ...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Create BOQ
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default BOQCreationForm;