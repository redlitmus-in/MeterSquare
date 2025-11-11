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
  Building2,
  Calendar,
  Clock,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Upload,
  Eye
} from 'lucide-react';
import { estimatorService } from '../services/estimatorService';
import { toast } from 'sonner';
import ModernLoadingSpinners from '../../../components/ui/ModernLoadingSpinners';

interface BOQEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  boqId: number;
  onSaveSuccess?: () => void;
}

interface Material {
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  brand?: string;
  description?: string;
  location?: string;
  vat_percentage?: number;
}

interface Labour {
  labour_role: string;
  hours: number;
  rate_per_hour: number;
  total_cost: number;
}

interface SubItem {
  sub_item_id?: number; // Backend sub-item ID
  sub_item_name: string;
  scope: string;
  location: string;
  brand: string;
  size: string;
  quantity: number;
  unit: string;
  rate: number;
  base_total: number;
  materials: Material[];
  labour: Labour[];
  materials_cost: number;
  labour_cost: number;
  description?: string;
  images?: File[];
  imageUrls?: string[];
  sub_item_image?: any[]; // Existing images from database
}

interface BOQItem {
  item_name: string;
  description: string;
  work_type: string;
  unit: string;
  quantity: number;
  rate: number;
  has_sub_items: boolean;
  sub_items: SubItem[];
  materials?: Material[];
  labour?: Labour[];
  overhead_percentage: number;
  profit_margin_percentage: number;
  discount_percentage: number;
  discount_amount: number;
  vat_percentage: number;
  vat_amount: number;
}

interface PreliminaryItem {
  id?: string;
  prelim_id?: number;
  name: string;
  description: string;
  checked: boolean;
  selected: boolean;
  isCustom?: boolean;
}

interface PreliminaryCostDetails {
  quantity: number;
  unit: string;
  rate: string | number;
  amount: number;
  internal_cost: number;
  misc_percentage: number;
  misc_amount: number;
  overhead_profit_percentage: number;
  overhead_profit_amount: number;
  transport_percentage: number;
  transport_amount: number;
  planned_profit: number;
  actual_profit: number;
}

interface ProjectDetails {
  project_name: string;
  location: string;
  floor: string;
  hours: string;
  status: string;
  start_date: string;
  end_date: string;
  duration_days: number;
}

const BOQEditModal: React.FC<BOQEditModalProps> = ({
  isOpen,
  onClose,
  boqId,
  onSaveSuccess
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'timeline'>('details');

  // BOQ Basic Info
  const [boqName, setBoqName] = useState('');
  const [status, setStatus] = useState('Draft');
  const [createdAt, setCreatedAt] = useState('');

  // Project Details
  const [projectDetails, setProjectDetails] = useState<ProjectDetails>({
    project_name: '',
    location: '',
    floor: '',
    hours: '',
    status: 'active',
    start_date: '',
    end_date: '',
    duration_days: 0
  });

  // BOQ Items
  const [items, setItems] = useState<BOQItem[]>([]);

  // Preliminaries
  const [preliminaryItems, setPreliminaryItems] = useState<PreliminaryItem[]>([]);
  const [preliminaryCostDetails, setPreliminaryCostDetails] = useState<PreliminaryCostDetails>({
    quantity: 1,
    unit: 'nos',
    rate: '0',
    amount: 0,
    internal_cost: 0,
    misc_percentage: 10,
    misc_amount: 0,
    overhead_profit_percentage: 25,
    overhead_profit_amount: 0,
    transport_percentage: 5,
    transport_amount: 0,
    planned_profit: 0,
    actual_profit: 0
  });
  const [customPreliminaryName, setCustomPreliminaryName] = useState('');
  const [customPreliminaryDesc, setCustomPreliminaryDesc] = useState('');

  // Global percentages
  const [overheadPercentage, setOverheadPercentage] = useState(10);
  const [profitMarginPercentage, setProfitMarginPercentage] = useState(15);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);

  // Expanded state
  const [expandedItems, setExpandedItems] = useState<number[]>([]);
  const [expandedSubItems, setExpandedSubItems] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && boqId) {
      fetchBOQData();
    }
  }, [isOpen, boqId]);

  const fetchBOQData = async () => {
    setIsLoading(true);
    try {
      const result = await estimatorService.getBOQById(boqId);
      if (result.success && result.data) {
        const data = result.data;

        // Set basic info
        setBoqName(data.boq_name || '');
        setStatus(data.status || 'Draft');
        setCreatedAt(data.created_at || '');

        // Get global percentages from boq_details if available
        const boqDetails = data.existing_purchase || data.boq_details || {};
        setOverheadPercentage(boqDetails.overhead_percentage || data.overhead_percentage || 10);
        setProfitMarginPercentage(boqDetails.profit_margin_percentage || data.profit_margin_percentage || 15);
        setDiscountPercentage(boqDetails.discount_percentage || data.discount_percentage || 0);
        setDiscountAmount(boqDetails.discount_amount || data.discount_amount || 0);

        // Set project details
        if (data.project_details) {
          setProjectDetails({
            project_name: data.project_details.project_name || '',
            location: data.project_details.location || '',
            floor: data.project_details.floor || '',
            hours: data.project_details.hours || '',
            status: data.project_details.status || 'active',
            start_date: data.project_details.start_date || '',
            end_date: data.project_details.end_date || '',
            duration_days: data.project_details.duration_days || 0
          });
        }

        // Set items from existing_purchase
        if (data.existing_purchase?.items) {
          setItems(data.existing_purchase.items);
          // Auto-expand first item
          setExpandedItems([0]);
        } else if (boqDetails.items) {
          setItems(boqDetails.items);
          setExpandedItems([0]);
        }

        // Set preliminaries
        if (data.preliminaries?.items) {
          setPreliminaryItems(data.preliminaries.items);
        }
        if (data.preliminaries?.cost_details) {
          setPreliminaryCostDetails(data.preliminaries.cost_details);
        }

        toast.success('BOQ data loaded successfully');
      } else {
        toast.error(result.message || 'Failed to fetch BOQ data');
      }
    } catch (error: any) {
      toast.error('Error loading BOQ data');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate duration when dates change
  useEffect(() => {
    if (projectDetails.start_date && projectDetails.end_date) {
      const start = new Date(projectDetails.start_date);
      const end = new Date(projectDetails.end_date);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setProjectDetails(prev => ({ ...prev, duration_days: diffDays }));
    }
  }, [projectDetails.start_date, projectDetails.end_date]);

  const handleSave = async () => {
    if (!boqName.trim()) {
      toast.error('BOQ name is required');
      return;
    }

    if (items.length === 0) {
      toast.error('At least one item is required');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        boq_name: boqName,
        items: items,
        overhead_percentage: overheadPercentage,
        profit_margin_percentage: profitMarginPercentage,
        discount_percentage: discountPercentage,
        discount_amount: discountAmount,
        project_details: projectDetails,
        preliminaries: {
          items: preliminaryItems.filter(item => item.checked || item.selected),
          cost_details: preliminaryCostDetails
        }
      };

      const result = await estimatorService.updateBOQ(boqId, payload);

      if (result.success) {
        toast.success('BOQ updated successfully');
        if (onSaveSuccess) {
          onSaveSuccess();
        }
        onClose();
      } else {
        toast.error(result.message || 'Failed to update BOQ');
      }
    } catch (error: any) {
      toast.error('Error saving BOQ');
    } finally {
      setIsSaving(false);
    }
  };

  // Item Management Functions
  const toggleItemExpanded = (index: number) => {
    setExpandedItems(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const toggleSubItemExpanded = (key: string) => {
    setExpandedSubItems(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const updateItem = (index: number, field: string, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const updateSubItem = (itemIndex: number, subIndex: number, field: string, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[itemIndex] };
      const subItems = [...item.sub_items];
      subItems[subIndex] = { ...subItems[subIndex], [field]: value };
      item.sub_items = subItems;
      updated[itemIndex] = item;
      return updated;
    });
  };

  const updateMaterial = (itemIndex: number, subIndex: number, matIndex: number, field: string, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[itemIndex] };
      const subItems = [...item.sub_items];
      const subItem = { ...subItems[subIndex] };
      const materials = [...subItem.materials];
      materials[matIndex] = { ...materials[matIndex], [field]: value };

      // Recalculate total_price
      if (field === 'quantity' || field === 'unit_price') {
        materials[matIndex].total_price = materials[matIndex].quantity * materials[matIndex].unit_price;
      }

      subItem.materials = materials;
      subItem.materials_cost = materials.reduce((sum, m) => sum + m.total_price, 0);
      subItems[subIndex] = subItem;
      item.sub_items = subItems;
      updated[itemIndex] = item;
      return updated;
    });
  };

  const updateLabour = (itemIndex: number, subIndex: number, labIndex: number, field: string, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[itemIndex] };
      const subItems = [...item.sub_items];
      const subItem = { ...subItems[subIndex] };
      const labour = [...subItem.labour];
      labour[labIndex] = { ...labour[labIndex], [field]: value };

      // Recalculate total_cost
      if (field === 'hours' || field === 'rate_per_hour') {
        labour[labIndex].total_cost = labour[labIndex].hours * labour[labIndex].rate_per_hour;
      }

      subItem.labour = labour;
      subItem.labour_cost = labour.reduce((sum, l) => sum + l.total_cost, 0);
      subItems[subIndex] = subItem;
      item.sub_items = subItems;
      updated[itemIndex] = item;
      return updated;
    });
  };

  const addMaterial = (itemIndex: number, subIndex: number) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[itemIndex] };
      const subItems = [...item.sub_items];
      const subItem = { ...subItems[subIndex] };
      subItem.materials = [
        ...subItem.materials,
        {
          material_name: '',
          quantity: 1,
          unit: 'nos',
          unit_price: 0,
          total_price: 0,
          brand: '',
          description: '',
          location: '',
          vat_percentage: 0
        }
      ];
      subItems[subIndex] = subItem;
      item.sub_items = subItems;
      updated[itemIndex] = item;
      return updated;
    });
  };

  const deleteMaterial = (itemIndex: number, subIndex: number, matIndex: number) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[itemIndex] };
      const subItems = [...item.sub_items];
      const subItem = { ...subItems[subIndex] };
      subItem.materials = subItem.materials.filter((_, idx) => idx !== matIndex);
      subItem.materials_cost = subItem.materials.reduce((sum, m) => sum + m.total_price, 0);
      subItems[subIndex] = subItem;
      item.sub_items = subItems;
      updated[itemIndex] = item;
      return updated;
    });
  };

  const addLabour = (itemIndex: number, subIndex: number) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[itemIndex] };
      const subItems = [...item.sub_items];
      const subItem = { ...subItems[subIndex] };
      subItem.labour = [
        ...subItem.labour,
        {
          labour_role: '',
          hours: 0,
          rate_per_hour: 0,
          total_cost: 0
        }
      ];
      subItems[subIndex] = subItem;
      item.sub_items = subItems;
      updated[itemIndex] = item;
      return updated;
    });
  };

  const deleteLabour = (itemIndex: number, subIndex: number, labIndex: number) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[itemIndex] };
      const subItems = [...item.sub_items];
      const subItem = { ...subItems[subIndex] };
      subItem.labour = subItem.labour.filter((_, idx) => idx !== labIndex);
      subItem.labour_cost = subItem.labour.reduce((sum, l) => sum + l.total_cost, 0);
      subItems[subIndex] = subItem;
      item.sub_items = subItems;
      updated[itemIndex] = item;
      return updated;
    });
  };

  // Preliminary Functions
  const togglePreliminaryItem = (index: number) => {
    setPreliminaryItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        checked: !updated[index].checked,
        selected: !updated[index].selected
      };
      return updated;
    });
  };

  const addCustomPreliminary = () => {
    if (!customPreliminaryName.trim() || !customPreliminaryDesc.trim()) {
      toast.error('Please enter both name and description for custom preliminary');
      return;
    }

    const newItem: PreliminaryItem = {
      id: `custom-${Date.now()}`,
      name: customPreliminaryName,
      description: customPreliminaryDesc,
      checked: true,
      selected: true,
      isCustom: true
    };

    setPreliminaryItems(prev => [...prev, newItem]);
    setCustomPreliminaryName('');
    setCustomPreliminaryDesc('');
    toast.success('Custom preliminary added');
  };

  const deleteCustomPreliminary = (index: number) => {
    setPreliminaryItems(prev => prev.filter((_, idx) => idx !== index));
    toast.success('Custom preliminary removed');
  };

  const updatePreliminaryCost = (field: keyof PreliminaryCostDetails, value: any) => {
    setPreliminaryCostDetails(prev => {
      const updated = { ...prev, [field]: value };

      // Recalculate amounts based on percentages
      const amount = Number(updated.amount) || 0;
      const misc_pct = Number(updated.misc_percentage) || 0;
      const overhead_pct = Number(updated.overhead_profit_percentage) || 0;
      const transport_pct = Number(updated.transport_percentage) || 0;

      updated.misc_amount = (amount * misc_pct) / 100;
      updated.overhead_profit_amount = (amount * overhead_pct) / 100;
      updated.transport_amount = (amount * transport_pct) / 100;
      updated.planned_profit = updated.overhead_profit_amount;
      updated.actual_profit = amount - updated.internal_cost - updated.misc_amount - updated.overhead_profit_amount - updated.transport_amount;

      return updated;
    });
  };

  const updateProjectDetail = (field: keyof ProjectDetails, value: string | number) => {
    setProjectDetails(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 py-8">
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
              className="relative bg-white rounded-xl shadow-xl w-full max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Edit BOQ</h2>
                    <p className="text-sm text-blue-100">BOQ ID: {boqId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <ModernLoadingSpinners size="sm" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 bg-gray-50 px-6 flex-shrink-0">
                <div className="flex gap-1">
                  <button
                    onClick={() => setActiveTab('details')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                      activeTab === 'details'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      BOQ Details
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('timeline')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                      activeTab === 'timeline'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      History & Timeline
                    </div>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <ModernLoadingSpinners size="lg" />
                    <p className="mt-6 text-gray-600">Loading BOQ data...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Project Information Section */}
                    <div className="bg-red-50 rounded-lg p-5 border border-red-200">
                      <h3 className="text-lg font-semibold text-red-900 mb-4 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-red-600" />
                        Project Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            BOQ Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={boqName}
                            onChange={(e) => setBoqName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter BOQ name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Project Name</label>
                          <input
                            type="text"
                            value={projectDetails.project_name}
                            onChange={(e) => updateProjectDetail('project_name', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Project name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                          <input
                            type="text"
                            value={projectDetails.location}
                            onChange={(e) => updateProjectDetail('location', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Location"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Floor</label>
                          <input
                            type="text"
                            value={projectDetails.floor}
                            onChange={(e) => updateProjectDetail('floor', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Floor"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Working Hours</label>
                          <input
                            type="text"
                            value={projectDetails.hours}
                            onChange={(e) => updateProjectDetail('hours', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Working hours"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                          <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            title="Select BOQ Status"
                          >
                            <option value="Draft">Draft</option>
                            <option value="In_Review">In Review</option>
                            <option value="Approved">Approved</option>
                            <option value="Sent_for_Confirmation">Sent for Confirmation</option>
                            <option value="Rejected">Rejected</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Project Timeline Section */}
                    <div className="bg-blue-50 rounded-lg p-5 border border-blue-200">
                      <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-blue-600" />
                        Project Timeline
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                          <input
                            type="date"
                            value={projectDetails.start_date}
                            onChange={(e) => updateProjectDetail('start_date', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                          <input
                            type="date"
                            value={projectDetails.end_date}
                            onChange={(e) => updateProjectDetail('end_date', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Duration (Days)</label>
                          <input
                            type="number"
                            value={projectDetails.duration_days}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                            placeholder="Auto-calculated"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Global Percentages */}
                    <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Global Settings</h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Overhead %</label>
                          <input
                            type="number"
                            value={overheadPercentage}
                            onChange={(e) => setOverheadPercentage(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            step="0.1"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Profit Margin %</label>
                          <input
                            type="number"
                            value={profitMarginPercentage}
                            onChange={(e) => setProfitMarginPercentage(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            step="0.1"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Discount %</label>
                          <input
                            type="number"
                            value={discountPercentage}
                            onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            step="0.1"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Discount Amount</label>
                          <input
                            type="number"
                            value={discountAmount}
                            onChange={(e) => setDiscountAmount(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            step="0.01"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Preliminaries Section */}
                    <div className="bg-purple-50 rounded-lg p-5 border border-purple-200">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-purple-600" />
                        Preliminaries & Approval Works
                      </h3>

                      {/* Preliminary Items List */}
                      <div className="space-y-2 mb-4">
                        {preliminaryItems.map((item, index) => (
                          <div key={item.id || index} className="bg-white rounded-lg p-3 border border-purple-200 flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={item.checked || item.selected}
                              onChange={() => togglePreliminaryItem(index)}
                              className="mt-1 w-4 h-4 text-purple-600 rounded"
                            />
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{item.name}</p>
                              <p className="text-sm text-gray-600">{item.description}</p>
                              {item.isCustom && (
                                <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                                  Custom
                                </span>
                              )}
                            </div>
                            {item.isCustom && (
                              <button
                                onClick={() => deleteCustomPreliminary(index)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded"
                                title="Delete custom preliminary"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Add Custom Preliminary */}
                      <div className="bg-white rounded-lg p-4 border border-purple-300 mb-4">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Add Custom Preliminary</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input
                            type="text"
                            value={customPreliminaryName}
                            onChange={(e) => setCustomPreliminaryName(e.target.value)}
                            placeholder="Preliminary name"
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                          />
                          <input
                            type="text"
                            value={customPreliminaryDesc}
                            onChange={(e) => setCustomPreliminaryDesc(e.target.value)}
                            placeholder="Description"
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                        <button
                          onClick={addCustomPreliminary}
                          className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          Add Custom Preliminary
                        </button>
                      </div>

                      {/* Preliminary Cost Details */}
                      <div className="bg-white rounded-lg p-4 border border-purple-300">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Cost Summary</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Quantity</label>
                            <input
                              type="number"
                              value={preliminaryCostDetails.quantity}
                              onChange={(e) => updatePreliminaryCost('quantity', Number(e.target.value))}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Unit</label>
                            <input
                              type="text"
                              value={preliminaryCostDetails.unit}
                              onChange={(e) => updatePreliminaryCost('unit', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Rate</label>
                            <input
                              type="number"
                              value={preliminaryCostDetails.rate}
                              onChange={(e) => updatePreliminaryCost('rate', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Amount</label>
                            <input
                              type="number"
                              value={preliminaryCostDetails.amount}
                              onChange={(e) => updatePreliminaryCost('amount', Number(e.target.value))}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Internal Cost</label>
                            <input
                              type="number"
                              value={preliminaryCostDetails.internal_cost}
                              onChange={(e) => updatePreliminaryCost('internal_cost', Number(e.target.value))}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Misc %</label>
                            <input
                              type="number"
                              value={preliminaryCostDetails.misc_percentage}
                              onChange={(e) => updatePreliminaryCost('misc_percentage', Number(e.target.value))}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Overhead & Profit %</label>
                            <input
                              type="number"
                              value={preliminaryCostDetails.overhead_profit_percentage}
                              onChange={(e) => updatePreliminaryCost('overhead_profit_percentage', Number(e.target.value))}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">Transport %</label>
                            <input
                              type="number"
                              value={preliminaryCostDetails.transport_percentage}
                              onChange={(e) => updatePreliminaryCost('transport_percentage', Number(e.target.value))}
                              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* BOQ Items Section */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Package className="w-5 h-5 text-blue-600" />
                        BOQ Items ({items.length})
                      </h3>

                      {items.map((item, itemIndex) => (
                        <div key={itemIndex} className="bg-blue-50 rounded-lg border border-blue-200 overflow-hidden">
                          {/* Item Header */}
                          <div
                            className="bg-blue-100 px-4 py-3 cursor-pointer hover:bg-blue-150 transition-colors flex items-center justify-between"
                            onClick={() => toggleItemExpanded(itemIndex)}
                          >
                            <div className="flex items-center gap-3">
                              {expandedItems.includes(itemIndex) ? (
                                <ChevronDown className="w-5 h-5 text-blue-600" />
                              ) : (
                                <ChevronRight className="w-5 h-5 text-blue-600" />
                              )}
                              <span className="font-semibold text-gray-900">
                                {itemIndex + 1}. {item.item_name}
                              </span>
                              {item.work_type && (
                                <span className="px-2 py-0.5 text-xs bg-blue-200 text-blue-700 rounded">
                                  {item.work_type}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-600">
                              {item.has_sub_items ? `${item.sub_items?.length || 0} sub-items` : 'Direct item'}
                            </div>
                          </div>

                          {/* Item Details (Expanded) */}
                          {expandedItems.includes(itemIndex) && (
                            <div className="p-4 space-y-4 bg-white">
                              {/* Basic Item Fields */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Item Name *</label>
                                  <input
                                    type="text"
                                    value={item.item_name}
                                    onChange={(e) => updateItem(itemIndex, 'item_name', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Work Type</label>
                                  <select
                                    value={item.work_type}
                                    onChange={(e) => updateItem(itemIndex, 'work_type', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="contract">Contract</option>
                                    <option value="daily_wages">Daily Wages</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
                                  <input
                                    type="text"
                                    value={item.unit}
                                    onChange={(e) => updateItem(itemIndex, 'unit', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                  value={item.description || ''}
                                  onChange={(e) => updateItem(itemIndex, 'description', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                  rows={2}
                                />
                              </div>

                              {/* Sub-Items */}
                              {item.has_sub_items && item.sub_items && item.sub_items.length > 0 && (
                                <div className="space-y-3">
                                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                    <Package className="w-4 h-4 text-green-600" />
                                    Sub-Items ({item.sub_items.length})
                                  </h4>
                                  {item.sub_items.map((subItem, subIndex) => {
                                    const subKey = `${itemIndex}-${subIndex}`;
                                    const isExpanded = expandedSubItems.includes(subKey);
                                    return (
                                      <div key={subIndex} className="bg-green-50 rounded-lg p-3 border border-green-300">
                                        <div
                                          className="cursor-pointer hover:bg-green-100 p-2 rounded transition-colors flex items-center justify-between"
                                          onClick={() => toggleSubItemExpanded(subKey)}
                                        >
                                          <div className="flex items-center gap-2">
                                            {isExpanded ? (
                                              <ChevronDown className="w-4 h-4 text-green-600" />
                                            ) : (
                                              <ChevronRight className="w-4 h-4 text-green-600" />
                                            )}
                                            <span className="font-medium text-gray-900">
                                              {subIndex + 1}. {subItem.sub_item_name || subItem.scope}
                                            </span>
                                          </div>
                                          <span className="text-xs text-gray-600">
                                            {subItem.materials?.length || 0} materials, {subItem.labour?.length || 0} labour
                                          </span>
                                        </div>

                                        {isExpanded && (
                                          <div className="mt-3 space-y-3 bg-white rounded p-3">
                                            {/* Sub-Item Basic Fields */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                              <div>
                                                <label className="block text-xs text-gray-600 mb-1">Sub-Item Name</label>
                                                <input
                                                  type="text"
                                                  value={subItem.sub_item_name}
                                                  onChange={(e) => updateSubItem(itemIndex, subIndex, 'sub_item_name', e.target.value)}
                                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-xs text-gray-600 mb-1">Location</label>
                                                <input
                                                  type="text"
                                                  value={subItem.location}
                                                  onChange={(e) => updateSubItem(itemIndex, subIndex, 'location', e.target.value)}
                                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-xs text-gray-600 mb-1">Brand</label>
                                                <input
                                                  type="text"
                                                  value={subItem.brand}
                                                  onChange={(e) => updateSubItem(itemIndex, subIndex, 'brand', e.target.value)}
                                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-xs text-gray-600 mb-1">Size</label>
                                                <input
                                                  type="text"
                                                  value={subItem.size}
                                                  onChange={(e) => updateSubItem(itemIndex, subIndex, 'size', e.target.value)}
                                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-xs text-gray-600 mb-1">Quantity</label>
                                                <input
                                                  type="number"
                                                  value={subItem.quantity}
                                                  onChange={(e) => updateSubItem(itemIndex, subIndex, 'quantity', Number(e.target.value))}
                                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                                                  step="0.01"
                                                />
                                              </div>
                                              <div>
                                                <label className="block text-xs text-gray-600 mb-1">Rate</label>
                                                <input
                                                  type="number"
                                                  value={subItem.rate}
                                                  onChange={(e) => updateSubItem(itemIndex, subIndex, 'rate', Number(e.target.value))}
                                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                                                  step="0.01"
                                                />
                                              </div>
                                            </div>

                                            <div>
                                              <label className="block text-xs text-gray-600 mb-1">Scope</label>
                                              <textarea
                                                value={subItem.scope}
                                                onChange={(e) => updateSubItem(itemIndex, subIndex, 'scope', e.target.value)}
                                                className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                                                rows={2}
                                              />
                                            </div>

                                            {/* Image Upload Section */}
                                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                              <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                                                <ImageIcon className="w-3.5 h-3.5" />
                                                Images <span className="text-gray-400 font-normal">(Optional)</span>
                                              </label>

                                              {/* Image Upload Input with Drag & Drop */}
                                              <div className="mb-2">
                                                <label
                                                  className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-green-500 hover:bg-green-50/30 transition-all"
                                                  onDragOver={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    e.currentTarget.classList.add('border-green-500', 'bg-green-50');
                                                  }}
                                                  onDragLeave={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    e.currentTarget.classList.remove('border-green-500', 'bg-green-50');
                                                  }}
                                                  onDrop={async (e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    e.currentTarget.classList.remove('border-green-500', 'bg-green-50');

                                                    const files = Array.from(e.dataTransfer.files).filter(
                                                      file => file.type.startsWith('image/')
                                                    );

                                                    if (files.length > 0) {
                                                      // If sub-item has ID, upload immediately
                                                      if (subItem.sub_item_id) {
                                                        toast.loading(`Uploading ${files.length} image(s)...`, { id: 'upload-images' });

                                                        const result = await estimatorService.uploadSubItemImages(subItem.sub_item_id, files);

                                                        if (result.success) {
                                                          // Refresh sub-item images from database
                                                          const imagesResult = await estimatorService.getSubItemImages(subItem.sub_item_id);
                                                          if (imagesResult.success && imagesResult.data.images) {
                                                            updateSubItem(itemIndex, subIndex, 'sub_item_image', imagesResult.data.images);
                                                          }
                                                          toast.success(`${files.length} image(s) uploaded successfully`, { id: 'upload-images' });
                                                        } else {
                                                          toast.error(result.message || 'Failed to upload images', { id: 'upload-images' });
                                                        }
                                                      } else {
                                                        // For new sub-items without ID, store locally
                                                        const existingImages = subItem.images || [];
                                                        const existingUrls = subItem.imageUrls || [];
                                                        const newUrls = files.map(file => URL.createObjectURL(file));

                                                        updateSubItem(itemIndex, subIndex, 'images', [...existingImages, ...files]);
                                                        updateSubItem(itemIndex, subIndex, 'imageUrls', [...existingUrls, ...newUrls]);
                                                        toast.success(`${files.length} image(s) added (will upload on save)`);
                                                      }
                                                    } else {
                                                      toast.error('Please drop only image files');
                                                    }
                                                  }}
                                                >
                                                  <Upload className="w-4 h-4 text-gray-500" />
                                                  <span className="text-sm text-gray-600">Click or drag images here</span>
                                                  <input
                                                    type="file"
                                                    accept="image/*"
                                                    multiple
                                                    className="hidden"
                                                    onChange={async (e) => {
                                                      const files = Array.from(e.target.files || []);
                                                      if (files.length > 0) {
                                                        // If sub-item has ID, upload immediately
                                                        if (subItem.sub_item_id) {
                                                          toast.loading(`Uploading ${files.length} image(s)...`, { id: 'upload-images' });

                                                          const result = await estimatorService.uploadSubItemImages(subItem.sub_item_id, files);

                                                          if (result.success) {
                                                            // Refresh sub-item images from database
                                                            const imagesResult = await estimatorService.getSubItemImages(subItem.sub_item_id);
                                                            if (imagesResult.success && imagesResult.data.images) {
                                                              updateSubItem(itemIndex, subIndex, 'sub_item_image', imagesResult.data.images);
                                                            }
                                                            toast.success(`${files.length} image(s) uploaded successfully`, { id: 'upload-images' });
                                                          } else {
                                                            toast.error(result.message || 'Failed to upload images', { id: 'upload-images' });
                                                          }
                                                        } else {
                                                          // For new sub-items without ID, store locally
                                                          const existingImages = subItem.images || [];
                                                          const existingUrls = subItem.imageUrls || [];
                                                          const newUrls = files.map(file => URL.createObjectURL(file));

                                                          updateSubItem(itemIndex, subIndex, 'images', [...existingImages, ...files]);
                                                          updateSubItem(itemIndex, subIndex, 'imageUrls', [...existingUrls, ...newUrls]);
                                                          toast.success(`${files.length} image(s) added (will upload on save)`);
                                                        }
                                                      }
                                                      e.target.value = '';
                                                    }}
                                                  />
                                                </label>
                                              </div>

                                              {/* Image Previews */}
                                              {((subItem.sub_item_image && subItem.sub_item_image.length > 0) || (subItem.imageUrls && subItem.imageUrls.length > 0)) && (
                                                <div className="grid grid-cols-4 gap-2">
                                                  {/* Show existing images from database */}
                                                  {subItem.sub_item_image && subItem.sub_item_image.map((image: any, imgIndex: number) => (
                                                    <div key={`db-${imgIndex}`} className="relative group">
                                                      <img
                                                        src={image.url}
                                                        alt={image.original_name || image.filename}
                                                        className="w-full h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:border-green-500 transition-all"
                                                        onClick={() => window.open(image.url, '_blank')}
                                                      />
                                                      <div
                                                        className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center cursor-pointer"
                                                        onClick={() => window.open(image.url, '_blank')}
                                                      >
                                                        <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                      </div>
                                                      <button
                                                        type="button"
                                                        onClick={async (e) => {
                                                          e.stopPropagation();
                                                          if (subItem.sub_item_id && image.filename) {
                                                            toast.loading('Deleting image...', { id: 'delete-image' });
                                                            const result = await estimatorService.deleteSubItemImages(subItem.sub_item_id, [image.filename]);
                                                            if (result.success) {
                                                              // Refresh images
                                                              const imagesResult = await estimatorService.getSubItemImages(subItem.sub_item_id);
                                                              if (imagesResult.success && imagesResult.data.images) {
                                                                updateSubItem(itemIndex, subIndex, 'sub_item_image', imagesResult.data.images);
                                                              }
                                                              toast.success('Image deleted', { id: 'delete-image' });
                                                            } else {
                                                              toast.error(result.message || 'Failed to delete image', { id: 'delete-image' });
                                                            }
                                                          }
                                                        }}
                                                        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                      >
                                                        <X className="w-3 h-3" />
                                                      </button>
                                                    </div>
                                                  ))}

                                                  {/* Show newly added images (not yet uploaded) */}
                                                  {subItem.imageUrls && subItem.imageUrls.map((url, imgIndex) => (
                                                    <div key={`new-${imgIndex}`} className="relative group">
                                                      <img
                                                        src={url}
                                                        alt={`Preview ${imgIndex + 1}`}
                                                        className="w-full h-20 object-cover rounded-lg border border-yellow-300 cursor-pointer hover:border-yellow-500 transition-all"
                                                        onClick={() => window.open(url, '_blank')}
                                                      />
                                                      <div className="absolute top-0 right-0 bg-yellow-500 text-white text-xs px-1 rounded-bl">New</div>
                                                      <div
                                                        className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center cursor-pointer"
                                                        onClick={() => window.open(url, '_blank')}
                                                      >
                                                        <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                      </div>
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          const newImages = (subItem.images || []).filter((_, i) => i !== imgIndex);
                                                          const newUrls = (subItem.imageUrls || []).filter((_, i) => i !== imgIndex);
                                                          updateSubItem(itemIndex, subIndex, 'images', newImages);
                                                          updateSubItem(itemIndex, subIndex, 'imageUrls', newUrls);
                                                          URL.revokeObjectURL(url);
                                                          toast.success('Image removed');
                                                        }}
                                                        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                      >
                                                        <X className="w-3 h-3" />
                                                      </button>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                            </div>

                                            {/* Materials */}
                                            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                                              <div className="flex items-center justify-between mb-2">
                                                <h5 className="text-xs font-semibold text-gray-900 flex items-center gap-1">
                                                  <Package className="w-4 h-4 text-blue-600" />
                                                  Materials ({subItem.materials?.length || 0})
                                                </h5>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    addMaterial(itemIndex, subIndex);
                                                  }}
                                                  className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 flex items-center gap-1"
                                                >
                                                  <Plus className="w-3 h-3" />
                                                  Add
                                                </button>
                                              </div>
                                              <div className="space-y-2">
                                                {subItem.materials?.map((material, matIndex) => (
                                                  <div key={matIndex} className="bg-white rounded p-2 border border-blue-200">
                                                    <div className="grid grid-cols-6 gap-2">
                                                      <input
                                                        type="text"
                                                        value={material.material_name}
                                                        onChange={(e) => updateMaterial(itemIndex, subIndex, matIndex, 'material_name', e.target.value)}
                                                        placeholder="Material"
                                                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-400"
                                                      />
                                                      <input
                                                        type="number"
                                                        value={material.quantity}
                                                        onChange={(e) => updateMaterial(itemIndex, subIndex, matIndex, 'quantity', Number(e.target.value))}
                                                        placeholder="Qty"
                                                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-400"
                                                        step="0.01"
                                                      />
                                                      <input
                                                        type="text"
                                                        value={material.unit}
                                                        onChange={(e) => updateMaterial(itemIndex, subIndex, matIndex, 'unit', e.target.value)}
                                                        placeholder="Unit"
                                                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-400"
                                                      />
                                                      <input
                                                        type="number"
                                                        value={material.unit_price}
                                                        onChange={(e) => updateMaterial(itemIndex, subIndex, matIndex, 'unit_price', Number(e.target.value))}
                                                        placeholder="Price"
                                                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-400"
                                                        step="0.01"
                                                      />
                                                      <div className="flex items-center justify-center">
                                                        <span className="text-xs font-medium text-gray-700">
                                                          {material.total_price?.toFixed(2) || '0.00'}
                                                        </span>
                                                      </div>
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          deleteMaterial(itemIndex, subIndex, matIndex);
                                                        }}
                                                        className="p-1 text-red-500 hover:bg-red-100 rounded flex items-center justify-center"
                                                        title="Delete material"
                                                        aria-label="Delete material"
                                                      >
                                                        <Trash2 className="w-3 h-3" />
                                                      </button>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                              <div className="mt-2 text-xs text-right font-semibold text-blue-900">
                                                Materials Total: AED {subItem.materials_cost?.toFixed(2) || '0.00'}
                                              </div>
                                            </div>

                                            {/* Labour */}
                                            <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                                              <div className="flex items-center justify-between mb-2">
                                                <h5 className="text-xs font-semibold text-gray-900 flex items-center gap-1">
                                                  <Users className="w-4 h-4 text-orange-600" />
                                                  Labour ({subItem.labour?.length || 0})
                                                </h5>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    addLabour(itemIndex, subIndex);
                                                  }}
                                                  className="px-2 py-1 bg-orange-500 text-white rounded text-xs hover:bg-orange-600 flex items-center gap-1"
                                                >
                                                  <Plus className="w-3 h-3" />
                                                  Add
                                                </button>
                                              </div>
                                              <div className="space-y-2">
                                                {subItem.labour?.map((labour, labIndex) => (
                                                  <div key={labIndex} className="bg-white rounded p-2 border border-orange-200">
                                                    <div className="grid grid-cols-5 gap-2">
                                                      <input
                                                        type="text"
                                                        value={labour.labour_role}
                                                        onChange={(e) => updateLabour(itemIndex, subIndex, labIndex, 'labour_role', e.target.value)}
                                                        placeholder="Role"
                                                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-orange-400"
                                                      />
                                                      <input
                                                        type="number"
                                                        value={labour.hours}
                                                        onChange={(e) => updateLabour(itemIndex, subIndex, labIndex, 'hours', Number(e.target.value))}
                                                        placeholder="Hours"
                                                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-orange-400"
                                                        step="0.01"
                                                      />
                                                      <input
                                                        type="number"
                                                        value={labour.rate_per_hour}
                                                        onChange={(e) => updateLabour(itemIndex, subIndex, labIndex, 'rate_per_hour', Number(e.target.value))}
                                                        placeholder="Rate/hr"
                                                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-orange-400"
                                                        step="0.01"
                                                      />
                                                      <div className="flex items-center justify-center">
                                                        <span className="text-xs font-medium text-gray-700">
                                                          {labour.total_cost?.toFixed(2) || '0.00'}
                                                        </span>
                                                      </div>
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          deleteLabour(itemIndex, subIndex, labIndex);
                                                        }}
                                                        className="p-1 text-red-500 hover:bg-red-100 rounded flex items-center justify-center"
                                                        title="Delete labour"
                                                        aria-label="Delete labour"
                                                      >
                                                        <Trash2 className="w-3 h-3" />
                                                      </button>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                              <div className="mt-2 text-xs text-right font-semibold text-orange-900">
                                                Labour Total: AED {subItem.labour_cost?.toFixed(2) || '0.00'}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
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

export default BOQEditModal;
