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
  ChevronUp,
  ChevronRight,
  Upload,
  Loader2,
  Search,
  PlusCircle,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import { ProjectOption, BOQMaterial, BOQLabour, BOQCreatePayload, WorkType } from '@/roles/estimator/types';
import { ModernSelect } from '@/components/ui/modern-select';

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
  discount_percentage: number;
  vat_percentage: number;
  master_item_id?: number; // Track if this is an existing item
  is_new?: boolean; // Track if this is a new item
}

interface BOQMaterialForm extends Omit<BOQMaterial, 'material_id' | 'total_price'> {
  id: string;
  description?: string; // Material description
  vat_percentage?: number; // VAT percentage for this specific material (optional, when using per-material VAT)
  master_material_id?: number; // Track if this is an existing material
  is_new?: boolean; // Track if this is a new material
  is_from_master?: boolean; // Track if selected from dropdown
}

interface BOQLabourForm extends Omit<BOQLabour, 'labour_id' | 'total_cost'> {
  id: string;
  master_labour_id?: number; // Track if this is an existing labour
  is_new?: boolean; // Track if this is a new labour
  is_from_master?: boolean; // Track if selected from dropdown
  work_type?: 'piece_rate' | 'contract' | 'daily_wages'; // Labour-specific work type
}

// Preliminaries interface
interface PreliminaryItem {
  id: string;
  description: string;
  checked: boolean;
  isCustom?: boolean; // Track if this is a custom added item
}

interface BOQCreationFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (boqId: number) => void;
  selectedProject?: any;
  hideBulkUpload?: boolean;
  hideTemplate?: boolean;
  isNewPurchase?: boolean; // For PM/SE adding extra BOQ
  existingBoqId?: number; // BOQ ID to add items to
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
  description?: string;
  current_market_price: number;
  default_unit: string;
}

interface MasterLabour {
  labour_id: number;
  labour_role: string;
  amount: number;
  work_type: string;
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

// Predefined Preliminaries & Approval Works
const DEFAULT_PRELIMINARIES: Omit<PreliminaryItem, 'id' | 'checked'>[] = [
  { description: 'Providing the necessary Health & Safety protection as per site requirements' },
  { description: 'Appointing Consultant for ALAIN Municipality and Civil defense' },
  { description: 'Obtaining authority approval (Al Ain Municipality, AACD, TAQA) with necessary submission drawings, Preparing AMC with base build fire Contractor' },
  { description: 'TAQA temporary power application through TAQA approved contractor' },
  { description: 'CAR Insurance: Complete Fit-out Insurance' },
  { description: 'Mobilization: Mobilization of necessary personnel required for works' },
  { description: 'Coordination: Allow for the comprehensive coordination of all services with other contractors, client, building maintenance team, security' },
  { description: 'Submission of sample board 3D MOOD board for client and Landlord approval' },
  { description: 'Scaffolding: Necessary scaffolding to carry out the works' },
  { description: 'Delay & Stop drawing preparation, rebuilt drawing and project managements of the project' },
  { description: 'Preliminaries cleaning on handover' }
];

const BOQCreationForm: React.FC<BOQCreationFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  selectedProject,
  hideBulkUpload = false,
  hideTemplate = false,
  isNewPurchase = false,
  existingBoqId
}) => {
  const [boqName, setBoqName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [items, setItems] = useState<BOQItemForm[]>([]);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [overallOverhead, setOverallOverhead] = useState(10);
  const [overallProfit, setOverallProfit] = useState(15);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isUploadingBulk, setIsUploadingBulk] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
  const [materialSearchTerms, setMaterialSearchTerms] = useState<Record<string, string>>({});
  const [labourSearchTerms, setLabourSearchTerms] = useState<Record<string, string>>({});

  // VAT mode state - tracks which items use per-material VAT
  const [useMaterialVAT, setUseMaterialVAT] = useState<Record<string, boolean>>({});

  // Preliminaries state
  const [preliminaries, setPreliminaries] = useState<PreliminaryItem[]>([]);
  const [preliminariesExpanded, setPreliminariesExpanded] = useState(false);
  const [preliminaryNotes, setPreliminaryNotes] = useState('Note: All authority charges & deposit are excluded (Approximate cost 10,000/-)');

  // Load projects and master items on mount
  useEffect(() => {
    if (isOpen) {
      loadProjects();
      loadMasterItems();
      // Initialize preliminaries with default items
      if (preliminaries.length === 0) {
        const initialPreliminaries = DEFAULT_PRELIMINARIES.map((item, index) => ({
          id: `prelim-${index}`,
          description: item.description,
          checked: false,
          isCustom: false
        }));
        setPreliminaries(initialPreliminaries);
      }
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
      console.log('Master items loaded:', itemsData.length, 'items');
      if (itemsData.length > 0) {
        console.log('Sample item:', itemsData[0]);
      }
      setMasterItems(itemsData);
    } catch (error) {
      console.error('Failed to load master items:', error);
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
      discount_percentage: 0,
      vat_percentage: 0,
      is_new: true
    };
    setItems(prevItems => [...prevItems, newItem]); // Add new item at the end
    setExpandedItems(prev => [...prev, newItem.id]);
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
    if (!searchTerm) return masterItems.slice(0, 10); // Show first 10 items when no search term
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
      vat_percentage: 0,
      is_new: true
    };

    setItems(items.map(item =>
      item.id === itemId
        ? { ...item, materials: [...item.materials, newMaterial] }
        : item
    ));
  };

  const selectMasterMaterial = (itemId: string, materialId: string, masterMaterial: MasterMaterial) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          materials: item.materials.map(mat =>
            mat.id === materialId ? {
              ...mat,
              material_name: masterMaterial.material_name,
              description: masterMaterial.description,
              unit: masterMaterial.default_unit,
              unit_price: masterMaterial.current_market_price,
              master_material_id: masterMaterial.material_id,
              is_from_master: true,
              is_new: false
            } : mat
          )
        };
      }
      return item;
    }));
  };

  const getAvailableMaterials = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item?.master_item_id) return [];
    return itemMaterials[item.master_item_id] || [];
  };

  const getAvailableLabour = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    if (!item?.master_item_id) return [];
    return itemLabours[item.master_item_id] || [];
  };

  const selectMasterLabour = (itemId: string, labourId: string, masterLabour: MasterLabour) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          labour: item.labour.map(lab =>
            lab.id === labourId ? {
              ...lab,
              labour_role: masterLabour.labour_role,
              rate_per_hour: masterLabour.amount / 8, // Convert amount to hourly rate
              hours: 8, // Default 8 hours
              master_labour_id: masterLabour.labour_id,
              is_from_master: true,
              is_new: false
            } : lab
          )
        };
      }
      return item;
    }));
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
      work_type: 'piece_rate', // Default to piece rate
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
    const subtotal = totalCost + profitAmount;
    const discountAmount = subtotal * (item.discount_percentage / 100);
    const afterDiscount = subtotal - discountAmount;

    // Calculate VAT based on mode
    let vatAmount = 0;
    if (useMaterialVAT[item.id]) {
      // Per-material VAT mode: Calculate VAT for each material separately
      vatAmount = item.materials.reduce((sum, m) => {
        const materialTotal = m.quantity * m.unit_price;
        const materialVAT = materialTotal * ((m.vat_percentage || 0) / 100);
        return sum + materialVAT;
      }, 0);
    } else {
      // Item-level VAT mode: Apply single VAT to after-discount amount
      vatAmount = afterDiscount * (item.vat_percentage / 100);
    }

    const sellingPrice = afterDiscount + vatAmount;
    return {
      baseCost,
      materialCost,
      labourCost,
      overheadAmount,
      totalCost,
      profitAmount,
      discountAmount,
      vatAmount,
      sellingPrice
    };
  };

  const calculateTotalCost = () => {
    return items.reduce((sum, item) => sum + calculateItemCost(item).sellingPrice, 0);
  };

  // Preliminary helper functions
  const togglePreliminary = (id: string) => {
    setPreliminaries(preliminaries.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  const addCustomPreliminary = () => {
    const newId = `prelim-custom-${Date.now()}`;
    setPreliminaries([...preliminaries, {
      id: newId,
      description: '',
      checked: false,
      isCustom: true
    }]);
  };

  const updatePreliminaryDescription = (id: string, description: string) => {
    setPreliminaries(preliminaries.map(item =>
      item.id === id ? { ...item, description } : item
    ));
  };

  const removePreliminary = (id: string) => {
    setPreliminaries(preliminaries.filter(item => item.id !== id));
  };

  const handleDownloadTemplate = async () => {
    try {
      // Download the Excel template
      const templateUrl = '/templates/BOQ_Template.xlsx';

      // Fetch the file as blob to ensure proper download
      const response = await fetch(templateUrl);

      if (!response.ok) {
        throw new Error('Template file not found');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'BOQ_Template.xlsx';
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download template. Please contact support.');
    }
  };

  const handleImportTemplate = () => {
    // Trigger file input click
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('File selected:', { name: file.name, size: file.size, type: file.type });

    // Validate file type
    const allowedExtensions = ['xlsx', 'xls'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
      toast.error('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    // Validate file size (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File size exceeds 10MB limit');
      return;
    }

    // Validate project and BOQ name
    if (!selectedProjectId) {
      toast.error('Please select a project first');
      return;
    }

    if (!boqName.trim()) {
      toast.error('Please enter BOQ name first');
      return;
    }

    console.log('Uploading BOQ:', { projectId: selectedProjectId, boqName, fileName: file.name });
    setIsUploadingBulk(true);

    try {
      const result = await estimatorService.bulkUploadBOQ(
        file,
        selectedProjectId,
        boqName
      );

      console.log('Upload result:', result);

      if (result.success && result.boq_id) {
        toast.success(result.message);

        // Show warnings if any
        if (result.warnings && result.warnings.length > 0) {
          setTimeout(() => {
            result.warnings.forEach((warning, index) => {
              setTimeout(() => toast.warning(warning, { duration: 5000 }), index * 100);
            });
          }, 500);
        }

        if (onSubmit) {
          onSubmit(result.boq_id);
        }
        onClose();
      } else {
        // Display error with proper formatting
        const errorMessage = result.message.split('\n').filter(msg => msg.trim());
        if (errorMessage.length > 1) {
          // Multiple errors - show them sequentially
          errorMessage.forEach((msg, index) => {
            setTimeout(() => {
              if (msg.includes('❌') || msg.includes('⚠️')) {
                toast.error(msg, { duration: 8000 });
              } else if (msg.trim()) {
                toast.error(msg, { duration: 6000 });
              }
            }, index * 200);
          });
        } else {
          // Single error
          toast.error(result.message, { duration: 8000 });
        }
      }
    } catch (error) {
      console.error('Upload exception:', error);
      toast.error('Failed to upload BOQ from Excel. Please check your file and try again.');
    } finally {
      setIsUploadingBulk(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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
      // Use new_purchase endpoint for PM/SE adding extra items
      if (isNewPurchase && existingBoqId) {
        const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const token = localStorage.getItem('access_token');

        const newPurchasePayload = {
          boq_id: existingBoqId,
          items: items.map(item => ({
            item_name: item.item_name,
            description: item.description || '',
            work_type: item.work_type,
            overhead_percentage: item.overhead_percentage,
            profit_margin_percentage: item.profit_margin_percentage,
            discount_percentage: item.discount_percentage,
            vat_percentage: item.vat_percentage,
            materials: item.materials.map(material => ({
              material_name: material.material_name,
              quantity: material.quantity,
              unit: material.unit,
              unit_price: material.unit_price,
              description: material.description,
              vat_percentage: material.vat_percentage
            })),
            labour: item.labour.map(labour => ({
              labour_role: labour.labour_role,
              hours: labour.hours,
              rate_per_hour: labour.rate_per_hour,
              work_type: labour.work_type || 'daily_wages'
            }))
          }))
        };

        const response = await fetch(`${API_URL}/new_purchase`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(newPurchasePayload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
          toast.success(result.message || 'Extra items added successfully');
          if (onSubmit) {
            onSubmit(existingBoqId);
          }
          onClose();
        } else {
          toast.error(result.error || 'Failed to add extra items');
        }
      } else {
        // Regular BOQ creation for Estimator
        const payload: BOQCreatePayload = {
          project_id: selectedProjectId,
          boq_name: boqName,
          status: 'Draft',
          created_by: 'Estimator',
          preliminaries: {
            items: preliminaries.filter(p => p.checked).map(p => ({
              description: p.description,
              isCustom: p.isCustom || false
            })),
            notes: preliminaryNotes
          },
          items: items.map(item => ({
            item_name: item.item_name,
            description: item.description || undefined,
            work_type: item.work_type,
            overhead_percentage: item.overhead_percentage,
            profit_margin_percentage: item.profit_margin_percentage,
            discount_percentage: item.discount_percentage,
            vat_percentage: item.vat_percentage,
            materials: item.materials.map(material => ({
              material_name: material.material_name,
              quantity: material.quantity,
              unit: material.unit,
              unit_price: material.unit_price,
              description: material.description,
              vat_percentage: material.vat_percentage
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
      }
    } catch (error) {
      toast.error(isNewPurchase ? 'Failed to add extra items' : 'Failed to create BOQ');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header - Match TD Style */}
          <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 border-b border-blue-100 px-6 py-5 flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-md">
                <FileText className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#243d8a]">Create New BOQ</h2>
                <p className="text-sm text-gray-600 mt-1">Build a detailed Bill of Quantities for your project</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isSubmitting}
              aria-label="Close dialog"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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

            {/* Preliminaries & Approval Works */}
            <div className="mb-6">
              <div
                className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg cursor-pointer hover:from-purple-100 hover:to-purple-200 transition-all"
                onClick={() => setPreliminariesExpanded(!preliminariesExpanded)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500 rounded-lg">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Preliminaries & Approval Works</h3>
                    <p className="text-xs text-gray-600">Select applicable conditions and terms</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 text-xs bg-purple-500 text-white rounded-full font-medium">
                    {preliminaries.filter(p => p.checked).length} / {preliminaries.length} selected
                  </span>
                  {preliminariesExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500" />
                  )}
                </div>
              </div>

              {preliminariesExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 p-6 bg-white rounded-lg border border-purple-200 shadow-sm"
                >
                  {/* Checklist Items */}
                  <div className="space-y-3 mb-4">
                    {preliminaries.map((item) => (
                      <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-purple-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => togglePreliminary(item.id)}
                          className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                          disabled={isSubmitting}
                        />
                        {item.isCustom ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updatePreliminaryDescription(item.id, e.target.value)}
                              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                              placeholder="Enter custom preliminary item..."
                              disabled={isSubmitting}
                            />
                            <button
                              type="button"
                              onClick={() => removePreliminary(item.id)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              disabled={isSubmitting}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex-1 text-sm text-gray-700 cursor-pointer">
                            {item.description}
                          </label>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Custom Item Button */}
                  <button
                    type="button"
                    onClick={addCustomPreliminary}
                    className="flex items-center gap-2 px-4 py-2 mb-4 text-purple-600 border border-purple-300 rounded-lg hover:bg-purple-50 transition-all font-medium"
                    disabled={isSubmitting}
                  >
                    <Plus className="w-4 h-4" />
                    Add Custom Item
                  </button>

                  {/* Notes Section */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Additional Notes
                    </label>
                    <textarea
                      value={preliminaryNotes}
                      onChange={(e) => setPreliminaryNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                      placeholder="Add any special conditions or notes..."
                      disabled={isSubmitting}
                    />
                  </div>
                </motion.div>
              )}
            </div>

            {/* BOQ Items - Match TD Style */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-gray-900">BOQ Items</h3>
                  {masterItems.length > 0 && (
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">
                      {masterItems.length} master items available
                    </span>
                  )}
                </div>
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
                    disabled={isSubmitting}
                  >
                    <Plus className="w-5 h-5" />
                    Add Item
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg relative">
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
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">Item #{index + 1}</span>
                          {item.master_item_id && (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">
                              Master
                            </span>
                          )}
                          {item.is_new && item.item_name && (
                            <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">
                              New
                            </span>
                          )}
                        </div>
                        <div className="flex-1 relative item-dropdown-container">
                          <div className="relative">
                            <input
                              type="text"
                              value={itemSearchTerms[item.id] || item.item_name}
                              onChange={(e) => handleItemNameChange(item.id, e.target.value)}
                              className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                              placeholder="Search or type item name"
                              disabled={isSubmitting || loadingItemData[item.id]}
                              onFocus={() => setItemDropdownOpen(prev => ({ ...prev, [item.id]: true }))}
                            />
                            {loadingItemData[item.id] ? (
                              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                            ) : (
                              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            )}
                          </div>
                          {itemDropdownOpen[item.id] && (
                            <div className="absolute z-[100] w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                              {(() => {
                                const filtered = getFilteredItems(itemSearchTerms[item.id] || '');
                                const showNewOption = itemSearchTerms[item.id] &&
                                  !filtered.some(i => i.item_name.toLowerCase() === itemSearchTerms[item.id].toLowerCase());

                                if (filtered.length === 0 && !showNewOption) {
                                  return (
                                    <div className="px-3 py-2 text-sm text-gray-500">
                                      {masterItems.length === 0 ? 'No master items available yet' : 'Type to search items or add new'}
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
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                          placeholder="Description (optional)"
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <span className="text-sm font-semibold text-gray-900">
                          AED {calculateItemCost(item).sellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                      <div className="p-4 space-y-4 bg-gray-50/50">
                        {/* Materials Section - Blue Theme like PM */}
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
                              onClick={() => addMaterial(item.id)}
                              className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                              disabled={isSubmitting}
                            >
                              + Add Material
                            </button>
                          </div>

                          {/* VAT Mode Toggle */}
                          <div className="mb-3 pb-3 border-b border-blue-200">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={useMaterialVAT[item.id] || false}
                                onChange={(e) => {
                                  setUseMaterialVAT(prev => ({
                                    ...prev,
                                    [item.id]: e.target.checked
                                  }));
                                  // Initialize VAT to 0 for all materials when enabling
                                  if (e.target.checked) {
                                    setItems(items.map(itm =>
                                      itm.id === item.id
                                        ? {
                                            ...itm,
                                            materials: itm.materials.map(m => ({
                                              ...m,
                                              vat_percentage: m.vat_percentage || 0
                                            }))
                                          }
                                        : itm
                                    ));
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                disabled={isSubmitting}
                              />
                              <span className="text-xs text-blue-900 font-medium">
                                Different VAT rates for materials
                              </span>
                              <span className="text-xs text-blue-600 italic">
                                (Check this if materials have different VAT percentages)
                              </span>
                            </label>
                          </div>

                          <div className="space-y-2">
                            {item.materials.map((material) => {
                              const availableMaterials = getAvailableMaterials(item.id);
                              const materialDropdownId = `${item.id}-${material.id}`;

                              return (
                                <div key={material.id} className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 relative">
                                    <input
                                      type="text"
                                      value={materialSearchTerms[materialDropdownId] || material.material_name}
                                      onChange={(e) => {
                                        setMaterialSearchTerms(prev => ({ ...prev, [materialDropdownId]: e.target.value }));
                                        if (!material.is_from_master) {
                                          updateMaterial(item.id, material.id, 'material_name', e.target.value);
                                        }
                                        if (availableMaterials.length > 0) {
                                          setMaterialDropdownOpen(prev => ({ ...prev, [materialDropdownId]: true }));
                                        }
                                      }}
                                      onFocus={() => {
                                        if (availableMaterials.length > 0) {
                                          setMaterialDropdownOpen(prev => ({ ...prev, [materialDropdownId]: true }));
                                        }
                                      }}
                                      className={`w-full px-3 py-1.5 pr-8 text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                                        material.is_from_master
                                          ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                                          : 'border-gray-300 bg-white focus:ring-blue-500 focus:border-blue-500'
                                      }`}
                                      placeholder={availableMaterials.length > 0 ? "Search materials or type new" : "Material name"}
                                      disabled={isSubmitting || material.is_from_master}
                                      title={material.is_from_master ? 'Material name from master data cannot be edited' : ''}
                                    />
                                    {availableMaterials.length > 0 && (
                                      <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                                    )}

                                    {materialDropdownOpen[materialDropdownId] && availableMaterials.length > 0 && (
                                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
                                        {availableMaterials
                                          .filter(mat =>
                                            !materialSearchTerms[materialDropdownId] ||
                                            mat.material_name.toLowerCase().includes(materialSearchTerms[materialDropdownId].toLowerCase())
                                          )
                                          .map(masterMaterial => (
                                            <button
                                              key={masterMaterial.material_id}
                                              type="button"
                                              onClick={() => {
                                                selectMasterMaterial(item.id, material.id, masterMaterial);
                                                setMaterialDropdownOpen(prev => ({ ...prev, [materialDropdownId]: false }));
                                                setMaterialSearchTerms(prev => ({ ...prev, [materialDropdownId]: masterMaterial.material_name }));
                                              }}
                                              className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
                                            >
                                              <div className="font-medium text-gray-900">{masterMaterial.material_name}</div>
                                              <div className="text-xs text-gray-500">
                                                ₹{masterMaterial.current_market_price}/{masterMaterial.default_unit}
                                              </div>
                                            </button>
                                          ))
                                        }
                                        {materialSearchTerms[materialDropdownId] &&
                                         !availableMaterials.some(mat =>
                                           mat.material_name.toLowerCase() === materialSearchTerms[materialDropdownId].toLowerCase()
                                         ) && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              updateMaterial(item.id, material.id, 'material_name', materialSearchTerms[materialDropdownId]);
                                              setMaterialDropdownOpen(prev => ({ ...prev, [materialDropdownId]: false }));
                                            }}
                                            className="w-full px-3 py-2 text-left text-sm bg-green-50 hover:bg-green-100 transition-colors border-t border-gray-200"
                                          >
                                            <div className="flex items-center gap-2">
                                              <PlusCircle className="w-3 h-3 text-green-600" />
                                              <span className="text-green-700 font-medium">
                                                Add "{materialSearchTerms[materialDropdownId]}" as new material
                                              </span>
                                            </div>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={material.quantity === 0 ? '' : material.quantity}
                                    onChange={(e) => {
                                      const value = e.target.value === '' ? 0 : Number(e.target.value);
                                      updateMaterial(item.id, material.id, 'quantity', value);
                                    }}
                                    className="w-24 px-3 py-1.5 pr-8 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="1"
                                    min="0"
                                    step="0.01"
                                    disabled={isSubmitting}
                                  />
                                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newValue = (material.quantity || 0) + 1;
                                        updateMaterial(item.id, material.id, 'quantity', newValue);
                                      }}
                                      className="px-1 hover:bg-blue-100 rounded text-blue-600"
                                      disabled={isSubmitting}
                                      title="Increase quantity"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newValue = Math.max(0, (material.quantity || 0) - 1);
                                        updateMaterial(item.id, material.id, 'quantity', newValue);
                                      }}
                                      className="px-1 hover:bg-blue-100 rounded text-blue-600"
                                      disabled={isSubmitting}
                                      title="Decrease quantity"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                <ModernSelect
                                  value={material.unit}
                                  onChange={(value) => updateMaterial(item.id, material.id, 'unit', value)}
                                  options={UNIT_OPTIONS}
                                  disabled={isSubmitting}
                                  className="w-24"
                                />
                                <div className="flex items-center gap-1">
                                  <span className="text-sm text-gray-500 font-medium">AED</span>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      value={material.unit_price === 0 ? '' : material.unit_price}
                                      onChange={(e) => {
                                        const value = e.target.value === '' ? 0 : Number(e.target.value);
                                        updateMaterial(item.id, material.id, 'unit_price', value);
                                      }}
                                      className="w-28 px-3 py-1.5 pr-8 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      placeholder="0.00"
                                      min="0"
                                      step="0.01"
                                      disabled={isSubmitting}
                                    />
                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newValue = (material.unit_price || 0) + 10;
                                          updateMaterial(item.id, material.id, 'unit_price', newValue);
                                        }}
                                        className="px-1 hover:bg-blue-100 rounded text-blue-600"
                                        disabled={isSubmitting}
                                        title="Increase price"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                        </svg>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newValue = Math.max(0, (material.unit_price || 0) - 10);
                                          updateMaterial(item.id, material.id, 'unit_price', newValue);
                                        }}
                                        className="px-1 hover:bg-blue-100 rounded text-blue-600"
                                        disabled={isSubmitting}
                                        title="Decrease price"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <span className="w-24 px-2 py-1 text-xs text-gray-600 bg-gray-50 rounded text-center font-medium">
                                  AED {(material.quantity * material.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

                              {/* Description and VAT fields below material row */}
                              <div className="ml-0 mt-1 flex gap-2">
                                <input
                                  type="text"
                                  value={material.description || ''}
                                  onChange={(e) => updateMaterial(item.id, material.id, 'description', e.target.value)}
                                  className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-gray-50"
                                  placeholder="Description (optional)"
                                  disabled={isSubmitting}
                                />

                                {/* Show VAT input only when per-material VAT is enabled */}
                                {useMaterialVAT[item.id] && (
                                  <div className="flex items-center gap-1 w-32">
                                    <span className="text-xs text-gray-600">VAT</span>
                                    <input
                                      type="number"
                                      value={material.vat_percentage === 0 ? '' : material.vat_percentage || ''}
                                      onChange={(e) => {
                                        const value = e.target.value === '' ? 0 : Number(e.target.value);
                                        updateMaterial(item.id, material.id, 'vat_percentage', value);
                                      }}
                                      className="w-16 px-2 py-1.5 text-xs border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 bg-white"
                                      placeholder="0"
                                      min="0"
                                      step="0.1"
                                      disabled={isSubmitting}
                                    />
                                    <span className="text-xs text-gray-600">%</span>
                                  </div>
                                )}
                              </div>
                            </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Labour Section - Orange Theme */}
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
                              onClick={() => addLabour(item.id)}
                              className="text-xs font-semibold text-orange-700 hover:text-orange-800"
                              disabled={isSubmitting}
                            >
                              + Add Labour
                            </button>
                          </div>
                          <div className="space-y-2">
                            {item.labour.map((labour) => {
                              const availableLabour = getAvailableLabour(item.id);
                              const labourDropdownId = `${item.id}-${labour.id}`;

                              return (
                                <div key={labour.id} className="flex items-center gap-2">
                                  <div className="flex-1 relative">
                                    <input
                                      type="text"
                                      value={labourSearchTerms[labourDropdownId] || labour.labour_role}
                                      onChange={(e) => {
                                        setLabourSearchTerms(prev => ({ ...prev, [labourDropdownId]: e.target.value }));
                                        if (!labour.is_from_master) {
                                          updateLabour(item.id, labour.id, 'labour_role', e.target.value);
                                        }
                                        if (availableLabour.length > 0) {
                                          setLabourDropdownOpen(prev => ({ ...prev, [labourDropdownId]: true }));
                                        }
                                      }}
                                      onFocus={() => {
                                        if (availableLabour.length > 0) {
                                          setLabourDropdownOpen(prev => ({ ...prev, [labourDropdownId]: true }));
                                        }
                                      }}
                                      className={`w-full px-3 py-1.5 pr-8 text-sm border rounded-lg focus:outline-none focus:ring-2 ${
                                        labour.is_from_master
                                          ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                                          : 'border-gray-300 bg-white focus:ring-blue-500 focus:border-blue-500'
                                      }`}
                                      placeholder={availableLabour.length > 0 ? "Search labour roles or type new" : "Labour role (e.g., Fabricator, Installer)"}
                                      disabled={isSubmitting || labour.is_from_master}
                                      title={labour.is_from_master ? 'Labour role from master data cannot be edited' : ''}
                                    />
                                    {availableLabour.length > 0 && (
                                      <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                                    )}

                                    {labourDropdownOpen[labourDropdownId] && availableLabour.length > 0 && (
                                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
                                        {availableLabour
                                          .filter(lab =>
                                            !labourSearchTerms[labourDropdownId] ||
                                            lab.labour_role.toLowerCase().includes(labourSearchTerms[labourDropdownId].toLowerCase())
                                          )
                                          .map(masterLabour => (
                                            <button
                                              key={masterLabour.labour_id}
                                              type="button"
                                              onClick={() => {
                                                selectMasterLabour(item.id, labour.id, masterLabour);
                                                setLabourDropdownOpen(prev => ({ ...prev, [labourDropdownId]: false }));
                                                setLabourSearchTerms(prev => ({ ...prev, [labourDropdownId]: masterLabour.labour_role }));
                                              }}
                                              className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
                                            >
                                              <div className="font-medium text-gray-900">{masterLabour.labour_role}</div>
                                              <div className="text-xs text-gray-500">
                                                ₹{masterLabour.amount} ({masterLabour.work_type})
                                              </div>
                                            </button>
                                          ))}
                                        {labourSearchTerms[labourDropdownId] &&
                                         !availableLabour.some(lab =>
                                           lab.labour_role.toLowerCase() === labourSearchTerms[labourDropdownId].toLowerCase()
                                         ) && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              updateLabour(item.id, labour.id, 'labour_role', labourSearchTerms[labourDropdownId]);
                                              setLabourDropdownOpen(prev => ({ ...prev, [labourDropdownId]: false }));
                                            }}
                                            className="w-full px-3 py-2 text-left text-sm bg-green-50 hover:bg-green-100 transition-colors border-t border-gray-200"
                                          >
                                            <div className="flex items-center gap-2">
                                              <PlusCircle className="w-3 h-3 text-green-600" />
                                              <span className="text-green-700 font-medium">
                                                Add "{labourSearchTerms[labourDropdownId]}" as new labour
                                              </span>
                                            </div>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                <div className="flex items-center gap-2">
                                  <select
                                    value={labour.work_type || 'piece_rate'}
                                    onChange={(e) => updateLabour(item.id, labour.id, 'work_type', e.target.value)}
                                    className="px-3 py-1.5 text-xs border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 bg-white"
                                    disabled={isSubmitting}
                                  >
                                    <option value="piece_rate">Piece Rate</option>
                                    <option value="contract">Contract</option>
                                    <option value="daily_wages">Daily Wages</option>
                                  </select>
                                </div>
                                <div className="relative">
                                  <input
                                    type="number"
                                    value={labour.hours === 0 ? '' : labour.hours}
                                    onChange={(e) => {
                                      const value = e.target.value === '' ? 0 : Number(e.target.value);
                                      updateLabour(item.id, labour.id, 'hours', value);
                                    }}
                                    className="w-24 px-3 py-1.5 pr-8 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="8"
                                    min="0"
                                    step="0.5"
                                    disabled={isSubmitting}
                                  />
                                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newValue = (labour.hours || 0) + 1;
                                        updateLabour(item.id, labour.id, 'hours', newValue);
                                      }}
                                      className="px-1 hover:bg-orange-100 rounded text-orange-600"
                                      disabled={isSubmitting}
                                      title="Increase hours"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newValue = Math.max(0, (labour.hours || 0) - 1);
                                        updateLabour(item.id, labour.id, 'hours', newValue);
                                      }}
                                      className="px-1 hover:bg-orange-100 rounded text-orange-600"
                                      disabled={isSubmitting}
                                      title="Decrease hours"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm text-gray-500 font-medium">AED</span>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      value={labour.rate_per_hour === 0 ? '' : labour.rate_per_hour}
                                      onChange={(e) => {
                                        const value = e.target.value === '' ? 0 : Number(e.target.value);
                                        updateLabour(item.id, labour.id, 'rate_per_hour', value);
                                      }}
                                      className="w-28 px-3 py-1.5 pr-8 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      placeholder="0.00"
                                      min="0"
                                      step="0.01"
                                      disabled={isSubmitting}
                                    />
                                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newValue = (labour.rate_per_hour || 0) + 10;
                                          updateLabour(item.id, labour.id, 'rate_per_hour', newValue);
                                        }}
                                        className="px-1 hover:bg-orange-100 rounded text-orange-600"
                                        disabled={isSubmitting}
                                        title="Increase rate"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                        </svg>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newValue = Math.max(0, (labour.rate_per_hour || 0) - 10);
                                          updateLabour(item.id, labour.id, 'rate_per_hour', newValue);
                                        }}
                                        className="px-1 hover:bg-orange-100 rounded text-orange-600"
                                        disabled={isSubmitting}
                                        title="Decrease rate"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <span className="w-24 px-2 py-1 text-xs text-gray-600 bg-gray-50 rounded text-center font-medium">
                                  AED {(labour.hours * labour.rate_per_hour).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                              );
                            })}
                          </div>
                        </div>

                        {/* Overhead, Profit & Discount for this item - Green Theme */}
                        <div className="bg-gradient-to-r from-green-50 to-green-100/30 rounded-lg p-4 border border-green-200">
                          <h5 className="text-sm font-bold text-green-900 mb-3 flex items-center gap-2">
                            <div className="p-1.5 bg-white rounded shadow-sm">
                              <Calculator className="w-4 h-4 text-green-600" />
                            </div>
                            Overheads, Profit & Discount
                          </h5>
                          <div className={`grid gap-4 ${useMaterialVAT[item.id] ? 'grid-cols-3' : 'grid-cols-4'}`}>
                          <div>
                            <label htmlFor={`overhead-${item.id}`} className="block text-xs text-gray-600 mb-1">Overhead %</label>
                            <div className="flex items-center gap-2">
                              <input
                                id={`overhead-${item.id}`}
                                type="number"
                                value={item.overhead_percentage === 0 ? '' : item.overhead_percentage}
                                onChange={(e) => {
                                  const value = e.target.value === '' ? 0 : Number(e.target.value);
                                  updateItem(item.id, 'overhead_percentage', value);
                                }}
                                className="flex-1 px-3 py-2 text-sm border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                                min="0"
                                step="0.1"
                                disabled={isSubmitting}
                                placeholder="10"
                              />
                              <span className="text-sm text-gray-500">%</span>
                            </div>
                          </div>
                          <div>
                            <label htmlFor={`profit-${item.id}`} className="block text-xs text-gray-600 mb-1">Profit Margin %</label>
                            <div className="flex items-center gap-2">
                              <input
                                id={`profit-${item.id}`}
                                type="number"
                                value={item.profit_margin_percentage === 0 ? '' : item.profit_margin_percentage}
                                onChange={(e) => {
                                  const value = e.target.value === '' ? 0 : Number(e.target.value);
                                  updateItem(item.id, 'profit_margin_percentage', value);
                                }}
                                className="flex-1 px-3 py-2 text-sm border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                                min="0"
                                step="0.1"
                                disabled={isSubmitting}
                                placeholder="15"
                              />
                              <span className="text-sm text-gray-500">%</span>
                            </div>
                          </div>
                          <div>
                            <label htmlFor={`discount-${item.id}`} className="block text-xs text-gray-600 mb-1">Discount %</label>
                            <div className="flex items-center gap-2">
                              <input
                                id={`discount-${item.id}`}
                                type="number"
                                value={item.discount_percentage === 0 ? '' : item.discount_percentage}
                                onChange={(e) => {
                                  const value = e.target.value === '' ? 0 : Number(e.target.value);
                                  updateItem(item.id, 'discount_percentage', value);
                                }}
                                className="flex-1 px-3 py-2 text-sm border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                                min="0"
                                max="100"
                                step="0.1"
                                disabled={isSubmitting}
                                placeholder="0"
                              />
                              <span className="text-sm text-gray-500">%</span>
                            </div>
                          </div>
                          {/* Show item-level VAT only when per-material VAT is disabled */}
                          {!useMaterialVAT[item.id] && (
                            <div>
                              <label htmlFor={`vat-${item.id}`} className="block text-xs text-gray-600 mb-1">VAT %</label>
                              <div className="flex items-center gap-2">
                                <input
                                  id={`vat-${item.id}`}
                                  type="number"
                                  value={item.vat_percentage === 0 ? '' : item.vat_percentage}
                                  onChange={(e) => {
                                    const value = e.target.value === '' ? 0 : Number(e.target.value);
                                    updateItem(item.id, 'vat_percentage', value);
                                  }}
                                  className="flex-1 px-3 py-2 text-sm border border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                                  min="0"
                                  step="0.1"
                                  disabled={isSubmitting}
                                  placeholder="5"
                                />
                                <span className="text-sm text-gray-500">%</span>
                              </div>
                            </div>
                          )}
                          </div>
                        </div>

                        {/* Cost Summary - Neutral like PM */}
                        {(() => {
                          const costs = calculateItemCost(item);
                          return (
                            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                              <h5 className="text-sm font-bold text-gray-900 mb-3">Cost Summary</h5>
                              <div className="space-y-1 text-xs">
                                <div className="flex justify-between py-1">
                                  <span className="text-gray-600">Materials:</span>
                                  <span className="font-semibold text-gray-900">AED {costs.materialCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between py-1">
                                  <span className="text-gray-600">Labour:</span>
                                  <span className="font-semibold text-gray-900">AED {costs.labourCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between py-1">
                                  <span className="text-gray-600">Overhead:</span>
                                  <span className="font-semibold text-gray-900">AED {costs.overheadAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between py-1">
                                  <span className="text-gray-600">Profit:</span>
                                  <span className="font-semibold text-gray-900">AED {costs.profitAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                {(item.discount_percentage || 0) > 0 && (
                                  <div className="flex justify-between py-1">
                                    <span className="text-red-600">Discount ({item.discount_percentage}%):</span>
                                    <span className="font-semibold text-red-600">- AED {costs.discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                  </div>
                                )}
                                {costs.vatAmount > 0 && (
                                  <div className="flex justify-between py-1">
                                    <span className="text-gray-600">
                                      {useMaterialVAT[item.id]
                                        ? 'VAT (Per Material):'
                                        : `VAT (${item.vat_percentage}%):`
                                      }
                                    </span>
                                    <span className="font-semibold text-gray-900">AED {costs.vatAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                  </div>
                                )}
                                <div className="flex justify-between font-bold border-t border-gray-300 pt-2 mt-2">
                                  <span className="text-gray-900">Total Price:</span>
                                  <span className="text-gray-900">AED {costs.sellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
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
                <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50/50">
                  <FileText className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-500 font-medium">No items added yet</p>
                  <p className="text-sm text-gray-400 mt-1">Click "Add Item" to start building your BOQ</p>
                </div>
              )}
            </div>

            {/* Total Summary */}
            {items.length > 0 && (
              <div className="mt-6 bg-gradient-to-r from-green-50 to-green-100 rounded-2xl p-5 border-2 border-green-300 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-gradient-to-br from-green-100 to-green-200 rounded-xl shadow-md">
                      <Calculator className="w-6 h-6 text-green-600" />
                    </div>
                    <h3 className="text-lg font-bold text-green-900">Total Project Value</h3>
                  </div>
                  <span className="text-3xl font-bold text-green-900">
                    AED {calculateTotalCost().toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer - Match TD Style */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
            {/* Hidden file input for Excel upload */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
            />

            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-all font-semibold shadow-sm"
              disabled={isSubmitting || isUploadingBulk}
            >
              Cancel
            </button>
            <div className="flex items-center gap-3">
              {!hideTemplate && (
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-all font-semibold shadow-sm"
                  disabled={isSubmitting || isUploadingBulk}
                  title="Download Excel template for bulk import"
                >
                  <FileText className="w-5 h-5" />
                  Download Template
                </button>
              )}
              {!hideBulkUpload && (
                <button
                  type="button"
                  onClick={handleImportTemplate}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-semibold shadow-sm"
                  disabled={isSubmitting || isUploadingBulk || !selectedProjectId || !boqName}
                  title={!selectedProjectId || !boqName ? "Please fill BOQ name and select project first" : "Import BOQ from Excel template"}
                >
                  {isUploadingBulk ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Import Template
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || isUploadingBulk || !boqName || !selectedProjectId || items.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 text-white rounded-lg hover:opacity-90 transition-all disabled:bg-gray-400 disabled:cursor-not-allowed font-bold shadow-lg"
                style={{ backgroundColor: isSubmitting || isUploadingBulk || !boqName || !selectedProjectId || items.length === 0 ? '' : 'rgb(36, 61, 138)' }}
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
  );
};

export default BOQCreationForm;