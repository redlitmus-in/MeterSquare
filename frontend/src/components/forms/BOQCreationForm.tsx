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
  Info,
  HelpCircle,
  TrendingUp,
  Pencil,
  Check,
  Image as ImageIcon,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { estimatorService } from '@/roles/estimator/services/estimatorService';
import { ProjectOption, BOQMaterial, BOQLabour, BOQCreatePayload, WorkType } from '@/roles/estimator/types';
import { ModernSelect } from '@/components/ui/modern-select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

// Backend-aligned interfaces
interface SubItemForm {
  id: string;
  sub_item_name: string; // Sub-item name
  scope: string; // Item scope/title
  size?: string; // Optional
  location?: string; // Optional
  brand?: string; // Optional
  quantity: number; // Required
  unit: string; // Required
  rate: number; // Required (Client rate per unit)

  // Per-sub-item percentages (calculated from client rate)
  misc_percentage: number;
  overhead_profit_percentage: number;
  transport_percentage: number;

  materials: BOQMaterialForm[]; // Raw materials for this sub-item
  labour: BOQLabourForm[]; // Labour for this sub-item

  master_sub_item_id?: number; // Track if this is an existing sub-item
  is_new?: boolean; // Track if this is a new sub-item

  // Image attachments
  images?: File[]; // Array of image files
  imageUrls?: string[]; // Array of image URLs for preview/display
  imageData?: Array<{url: string, filename?: string, isExisting?: boolean}>; // Track if image is from backend
}

interface BOQItemForm {
  id: string;
  item_name: string;
  description: string;
  quantity?: number; // Item quantity
  unit?: string; // Item unit
  rate?: number; // Item rate
  work_type: WorkType;
  sub_items: SubItemForm[]; // Sub-items with their own raw materials
  materials: BOQMaterialForm[];
  labour: BOQLabourForm[];
  miscellaneous_percentage?: number;
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
  prelim_id?: number; // Database ID from preliminaries_master
  description: string;
  checked: boolean;
  isCustom?: boolean; // Track if this is a custom added item
  quantity?: number;
  unit?: string;
  rate?: number;
  amount?: number;
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
  editMode?: boolean; // For editing existing BOQ
  existingBoqData?: any; // Existing BOQ data for edit mode
  isInternalRevisionMode?: boolean; // For Internal Revisions tab - always use /update_internal_boq endpoint
  isRevision?: boolean; // For creating revision
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
  { value: 'bag', label: 'Bag' },
  { value: 'box', label: 'Box' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'can', label: 'Can' },
  { value: 'carton', label: 'Carton' },
  { value: 'cu.ft', label: 'Cu.ft' },
  { value: 'cu.m', label: 'Cu.m' },
  { value: 'drum', label: 'Drum' },
  { value: 'ft', label: 'Ft' },
  { value: 'gms', label: 'Gms' },
  { value: 'kgs', label: 'Kgs' },
  { value: 'ls', label: 'LS' },
  { value: 'ltr', label: 'Ltr' },
  { value: 'ml', label: 'Ml' },
  { value: 'mtrs', label: 'Mtrs' },
  { value: 'nos', label: 'Nos' },
  { value: 'pair', label: 'Pair' },
  { value: 'pcs', label: 'Pcs' },
  { value: 'R.ft', label: 'R.ft' },
  { value: 'roll', label: 'Roll' },
  { value: 'set', label: 'Set' },
  { value: 'sheet', label: 'Sheet' },
  { value: 'sq.ft', label: 'Sq.ft' },
  { value: 'sq.m', label: 'Sq.m' },
  { value: 'tons', label: 'Tons' }
];

// Predefined Preliminaries & Approval Works
// Removed hardcoded DEFAULT_PRELIMINARIES - now fetched from backend

const BOQCreationForm: React.FC<BOQCreationFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  selectedProject,
  hideBulkUpload = false,
  hideTemplate = false,
  isNewPurchase = false,
  existingBoqId,
  editMode = false,
  existingBoqData,
  isInternalRevisionMode = false,
  isRevision = false
}) => {
  const [boqName, setBoqName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [items, setItems] = useState<BOQItemForm[]>([]);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [overallOverhead, setOverallOverhead] = useState(10);
  const [overallProfit, setOverallProfit] = useState(15);
  const [overallDiscount, setOverallDiscount] = useState(0); // Overall BOQ discount percentage
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

  // VAT mode state - tracks which items use per-material VAT (REMOVED - No longer needed)

  // Preliminaries state
  const [preliminaries, setPreliminaries] = useState<PreliminaryItem[]>([]);
  const [preliminariesExpanded, setPreliminariesExpanded] = useState(false);
  const [preliminaryListExpanded, setPreliminaryListExpanded] = useState(false);
  const [editingPreliminaryId, setEditingPreliminaryId] = useState<string | null>(null);
  const [preliminaryNotes, setPreliminaryNotes] = useState('');

  // Separate cost details state (independent from checkboxes)
  const [costQuantity, setCostQuantity] = useState<number>(1);
  const [costUnit, setCostUnit] = useState<string>('nos');
  const [costRate, setCostRate] = useState<number>(0);
  const [costAmount, setCostAmount] = useState<number>(0);

  // Preliminary internal costing
  const [preliminaryInternalCost, setPreliminaryInternalCost] = useState<number>(0);
  const [preliminaryMiscPercentage, setPreliminaryMiscPercentage] = useState<number>(10);
  const [preliminaryOverheadProfitPercentage, setPreliminaryOverheadProfitPercentage] = useState<number>(25);
  const [preliminaryTransportPercentage, setPreliminaryTransportPercentage] = useState<number>(5);

  // Custom units state
  const [customUnits, setCustomUnits] = useState<Array<{ value: string; label: string }>>([]);
  const [allUnitOptions, setAllUnitOptions] = useState<Array<{ value: string; label: string }>>(UNIT_OPTIONS);

  // Load projects and master items on mount
  useEffect(() => {
    if (isOpen) {
      loadProjects();
      loadMasterItems();
      // Always load master preliminaries to show available options
      loadMasterPreliminaries();
      loadCustomUnits();
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

  const loadMasterPreliminaries = async () => {
    try {
      const response = await estimatorService.getAllPreliminaryMasters();

      if (response.success && response.data && response.data.length > 0) {
        // Map preliminary masters to UI format
        const items = response.data.map((item: any) => ({
          id: `prelim-${item.prelim_id}`,
          prelim_id: item.prelim_id,
          description: item.description || '',
          checked: false, // Start with all unchecked for new BOQ
          isCustom: false,
          quantity: 1,
          unit: item.unit || 'nos',
          rate: item.rate || 0,
          amount: 0
        }));

        setPreliminaries(items);
      } else {
        // If no items in database, start with empty
        setPreliminaries([]);
      }
    } catch (error) {
      console.error('Failed to load master preliminaries:', error);
      toast.error('Failed to load preliminary items');
      setPreliminaries([]);
    }
  };

  const loadCustomUnits = async () => {
    try {
      const response = await estimatorService.getCustomUnits();
      if (response.success && response.data) {
        const customUnitsFromDB = response.data.map((unit: any) => ({
          value: unit.value,
          label: unit.label
        }));
        setCustomUnits(customUnitsFromDB);

        // Merge predefined and custom units
        const merged = [...UNIT_OPTIONS, ...customUnitsFromDB];
        setAllUnitOptions(merged);
      }
    } catch (error) {
      console.error('Failed to load custom units:', error);
      // Don't show error toast - custom units are optional
    }
  };

  const saveCustomUnit = async (unitValue: string) => {
    try {
      // Normalize the unit value
      const normalizedValue = unitValue.trim().toLowerCase();

      // Check if unit already exists in either predefined or custom units
      const existsInPredefined = UNIT_OPTIONS.some(
        opt => opt.value.toLowerCase() === normalizedValue
      );
      const existsInCustom = customUnits.some(
        opt => opt.value.toLowerCase() === normalizedValue
      );

      if (existsInPredefined || existsInCustom) {
        return; // Unit already exists, no need to save
      }

      // Create label from value (capitalize first letter)
      const unitLabel = unitValue.trim().charAt(0).toUpperCase() + unitValue.trim().slice(1);

      // Save to database
      const response = await estimatorService.createCustomUnit(normalizedValue, unitLabel);

      if (response.success && response.unit) {
        const newUnit = {
          value: response.unit.value,
          label: response.unit.label
        };

        // Update custom units state
        const updatedCustomUnits = [...customUnits, newUnit];
        setCustomUnits(updatedCustomUnits);

        // Update all unit options
        const merged = [...UNIT_OPTIONS, ...updatedCustomUnits];
        setAllUnitOptions(merged);

        console.log('Custom unit saved:', newUnit);
      }
    } catch (error) {
      console.error('Failed to save custom unit:', error);
      // Don't show error toast - units will still work locally
    }
  };

  const loadPreliminariesFromExisting = () => {
    // Load preliminaries from existing BOQ data when editing
    if (existingBoqData && existingBoqData.preliminaries) {
      const preliminaryData = existingBoqData.preliminaries;

      // Extract items from the preliminary data
      if (preliminaryData.items && Array.isArray(preliminaryData.items)) {
        const items = preliminaryData.items.map((item: any, index: number) => ({
          id: item.id || `prelim-${index}`,
          description: item.description || '',
          checked: item.checked || item.selected || false,
          isCustom: item.isCustom || false,
          quantity: 1,
          unit: 'nos',
          rate: 0,
          amount: 0
        }));

        setPreliminaries(items);
      }

      // Set cost details if available
      const costDetails = preliminaryData.cost_details || preliminaryData.cost_analysis;
      if (costDetails) {
        setCostQuantity(costDetails.quantity || 1);
        setCostUnit(costDetails.unit || 'nos');
        setCostRate(costDetails.rate || 0);
        setCostAmount(costDetails.amount || costDetails.client_rate || 0);
        setPreliminaryInternalCost(costDetails.internal_cost || 0);
        setPreliminaryMiscPercentage(costDetails.misc_percentage || 10);
        setPreliminaryOverheadProfitPercentage(costDetails.overhead_profit_percentage || 25);
        setPreliminaryTransportPercentage(costDetails.transport_percentage || 5);
      }

      // Set notes if available
      if (preliminaryData.notes) {
        setPreliminaryNotes(preliminaryData.notes);
      }
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

  // Load existing BOQ data when in edit mode or revision mode
  useEffect(() => {
    const loadExistingBoqData = async () => {
      if (!isOpen || (!editMode && !isRevision) || !existingBoqData) return;

      try {
        // Fetch full BOQ details if we only have basic data
        let boqDetails = existingBoqData;
        if (existingBoqData.boq_id && !existingBoqData.boq_details) {
          const response = await estimatorService.getBOQById(existingBoqData.boq_id);
          if (response.success && response.data) {
            boqDetails = response.data;
          } else {
            throw new Error(response.message || 'Failed to load BOQ');
          }
        }

        // Set basic BOQ info
        setBoqName(isRevision ? `${boqDetails.boq_name} - Revision` : boqDetails.boq_name);
        setSelectedProjectId(boqDetails.project_id);

        // Load and merge preliminaries with master list
        const prelimsData = boqDetails.preliminaries || {};
        if (prelimsData.items && Array.isArray(prelimsData.items)) {
          // Get the current master preliminaries list
          const response = await estimatorService.getAllPreliminaryMasters();

          if (response.success && response.data) {
            // Create a map of existing selected preliminaries
            const selectedPrelimsMap = new Map();
            prelimsData.items.forEach((item: any) => {
              if (item.prelim_id) {
                selectedPrelimsMap.set(item.prelim_id, item);
              } else if (item.description) {
                // For custom items without prelim_id
                selectedPrelimsMap.set(`custom-${item.description}`, item);
              }
            });

            // Build the complete list with master items
            const mergedPreliminaries = response.data.map((masterItem: any) => {
              const existingItem = selectedPrelimsMap.get(masterItem.prelim_id);
              return {
                id: `prelim-${masterItem.prelim_id}`,
                prelim_id: masterItem.prelim_id,
                description: masterItem.description || '',
                checked: !!existingItem, // Check if this item was selected in existing BOQ
                isCustom: false,
                quantity: existingItem?.quantity || 1,
                unit: existingItem?.unit || masterItem.unit || 'nos',
                rate: existingItem?.rate || masterItem.rate || 0,
                amount: existingItem?.amount || 0
              };
            });

            // Add any custom preliminaries that aren't in master list
            prelimsData.items.forEach((item: any) => {
              if (item.isCustom || !item.prelim_id) {
                mergedPreliminaries.push({
                  id: item.id || `custom-${Date.now()}-${Math.random()}`,
                  description: item.description,
                  checked: true, // Custom items were selected
                  isCustom: true,
                  prelim_id: undefined, // No prelim_id for custom items
                  quantity: item.quantity || 1,
                  unit: item.unit || 'nos',
                  rate: item.rate || 0,
                  amount: item.amount || 0
                });
              }
            });

            setPreliminaries(mergedPreliminaries);
          } else {
            // Fallback to just loading existing preliminaries if master fetch fails
            const loadedPreliminaries = prelimsData.items.map((item: any, index: number) => ({
              id: item.id || `prelim-${index}`,
              prelim_id: item.prelim_id,
              description: item.description,
              checked: true, // All existing items were selected
              isCustom: item.isCustom || false,
              quantity: item.quantity || 1,
              unit: item.unit || 'nos',
              rate: item.rate || 0,
              amount: item.amount || 0
            }));
            setPreliminaries(loadedPreliminaries);
          }
        } else {
          // No existing preliminaries, just keep the master list loaded earlier
          // The master list is already loaded in the useEffect
        }

        // Load cost details if available
        if (prelimsData.cost_details) {
          setCostQuantity(prelimsData.cost_details.quantity || 1);
          setCostUnit(prelimsData.cost_details.unit || 'nos');
          setCostRate(prelimsData.cost_details.rate || 0);
          setCostAmount(prelimsData.cost_details.amount || 0);
          // Load internal costing fields
          setPreliminaryInternalCost(prelimsData.cost_details.internal_cost || 0);
          setPreliminaryMiscPercentage(prelimsData.cost_details.misc_percentage || 10);
          setPreliminaryOverheadProfitPercentage(prelimsData.cost_details.overhead_profit_percentage || 25);
          setPreliminaryTransportPercentage(prelimsData.cost_details.transport_percentage || 5);
        }

        // Load preliminary notes if available
        if (prelimsData.notes) {
          setPreliminaryNotes(prelimsData.notes);
        }

        // Load overall discount if available
        if (boqDetails.discount_percentage) {
          setOverallDiscount(boqDetails.discount_percentage);
        }

        // Get items from existing_purchase.items (backend structure)
        const boqItems = boqDetails.existing_purchase?.items || [];

        // Convert BOQ items to form format
        if (boqItems && boqItems.length > 0) {
          const formItems: BOQItemForm[] = boqItems.map((item: any, index: number) => {
            // Convert sub-items
            const subItems: SubItemForm[] = (item.sub_items || []).map((subItem: any, siIndex: number) => ({
              id: `si-${index}-${siIndex}-${Date.now()}`,
              sub_item_name: subItem.sub_item_name || '',
              scope: subItem.scope || '',
              size: subItem.size || '',
              location: subItem.location || '',
              brand: subItem.brand || '',
              quantity: subItem.quantity || 1,
              unit: subItem.unit || 'nos',
              rate: subItem.rate || 0,
              misc_percentage: subItem.misc_percentage || 10,
              overhead_profit_percentage: subItem.overhead_profit_percentage || 25,
              transport_percentage: subItem.transport_percentage || 5,
              materials: (subItem.materials || []).map((mat: any, matIndex: number) => ({
                id: `mat-si-${index}-${siIndex}-${matIndex}-${Date.now()}`,
                material_name: mat.material_name,
                quantity: mat.quantity || 1,
                unit: mat.unit || 'nos',
                unit_price: mat.unit_price || 0,
                description: mat.description || '',
                vat_percentage: mat.vat_percentage || 0,
                master_material_id: mat.master_material_id,
                is_from_master: !!mat.master_material_id,
                is_new: !mat.master_material_id
              })),
              labour: (subItem.labour || []).map((lab: any, labIndex: number) => ({
                id: `lab-si-${index}-${siIndex}-${labIndex}-${Date.now()}`,
                labour_role: lab.labour_role,
                hours: lab.hours || 8,
                rate_per_hour: lab.rate_per_hour || 0,
                work_type: lab.work_type || 'daily_wages',
                master_labour_id: lab.master_labour_id,
                is_from_master: !!lab.master_labour_id,
                is_new: !lab.master_labour_id
              }))
            }));

            // Convert item-level materials and labour (for items without sub-items)
            const materials: BOQMaterialForm[] = (item.materials || []).map((mat: any, matIndex: number) => ({
              id: `mat-${index}-${matIndex}-${Date.now()}`,
              material_name: mat.material_name,
              quantity: mat.quantity || 1,
              unit: mat.unit || 'nos',
              unit_price: mat.unit_price || 0,
              description: mat.description || '',
              vat_percentage: mat.vat_percentage || 0,
              master_material_id: mat.master_material_id,
              is_from_master: !!mat.master_material_id,
              is_new: !mat.master_material_id
            }));

            const labour: BOQLabourForm[] = (item.labour || []).map((lab: any, labIndex: number) => ({
              id: `lab-${index}-${labIndex}-${Date.now()}`,
              labour_role: lab.labour_role,
              hours: lab.hours || 8,
              rate_per_hour: lab.rate_per_hour || 0,
              work_type: lab.work_type || 'daily_wages',
              master_labour_id: lab.master_labour_id,
              is_from_master: !!lab.master_labour_id,
              is_new: !lab.master_labour_id
            }));

            return {
              id: `item-${index}-${Date.now()}`,
              item_name: item.item_name,
              description: item.description || '',
              quantity: item.quantity || 1,
              unit: item.unit || 'nos',
              rate: item.rate || 0,
              work_type: item.work_type || 'daily_wages',
              sub_items: subItems,
              materials,
              labour,
              overhead_percentage: item.overhead_percentage || 10,
              profit_margin_percentage: item.profit_margin_percentage || 15,
              discount_percentage: item.discount_percentage || 0,
              vat_percentage: item.vat_percentage || 0,
              master_item_id: item.master_item_id,
              is_new: !item.master_item_id
            };
          });

          setItems(formItems);
          // Expand all items by default in edit mode
          setExpandedItems(formItems.map(item => item.id));
        }

        toast.success(editMode ? 'BOQ loaded for editing' : 'BOQ data loaded');
      } catch (error) {
        console.error('Failed to load BOQ data:', error);
        toast.error('Failed to load BOQ data');
      }
    };

    loadExistingBoqData();
  }, [isOpen, editMode, existingBoqData, isRevision]);

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
      quantity: 1,
      unit: 'nos',
      rate: 0,
      work_type: 'daily_wages',
      sub_items: [],
      materials: [],
      labour: [
        {
          id: `lab-${Date.now()}`,
          labour_role: '',
          hours: 8,
          rate_per_hour: 0,
          work_type: 'daily_wages',
          is_new: true
        }
      ],
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
      // Load sub-items with materials and labour for this item
      const subItemsData = await estimatorService.getItemSubItems(masterItem.item_id);

      // Fetch images for each sub-item that has a sub_item_id
      const subItemsWithImages = await Promise.all(
        subItemsData.sub_items.map(async (subItem) => {
          let imageUrls: string[] = [];
          let imageData: Array<{url: string, filename?: string, isExisting?: boolean}> = [];

          if (subItem.sub_item_id) {
            try {
              const imagesResponse = await estimatorService.getSubItemImages(subItem.sub_item_id);
              if (imagesResponse && imagesResponse.data && imagesResponse.data.images) {
                // Extract URLs and metadata from image objects
                imageUrls = imagesResponse.data.images.map((img: any) => img.url);
                imageData = imagesResponse.data.images.map((img: any) => ({
                  url: img.url,
                  filename: img.filename,
                  isExisting: true
                }));
              }
            } catch (error) {
              // No images found, continue
            }
          }

          return { ...subItem, imageUrls, imageData };
        })
      );

      // Update the item with master data
    setItems(items.map(item => {
      if (item.id === itemId) {
        // Convert master sub-items to form sub-items
        const formSubItems: SubItemForm[] = subItemsWithImages.map((subItem, index) => ({
          id: `si-${itemId}-${index}-${Date.now()}`,
          sub_item_name: subItem.sub_item_name || '',
          scope: subItem.description || '',
          size: (subItem as any).size || '',
          location: subItem.location || '',
          brand: subItem.brand || '',
          quantity: subItem.quantity || 1,
          unit: subItem.unit || 'nos',
          rate: subItem.per_unit_cost || 0,
          misc_percentage: 10,
          overhead_profit_percentage: 25,
          transport_percentage: 5,
          master_sub_item_id: subItem.sub_item_id, // Store master sub-item ID
          imageUrls: (subItem as any).imageUrls || [], // Add fetched images
          imageData: (subItem as any).imageData || [], // Add image metadata
          materials: (subItem.materials || []).map((mat, matIndex) => ({
            id: `mat-si-${itemId}-${index}-${matIndex}-${Date.now()}`,
            material_name: mat.material_name,
            quantity: mat.quantity || 1,
            unit: mat.unit || 'nos',
            unit_price: mat.current_market_price || 0,
            description: '',
            master_material_id: mat.material_id,
            is_from_master: true,
            is_new: false
          })),
          labour: (subItem.labour || []).map((lab, labIndex) => ({
            id: `lab-si-${itemId}-${index}-${labIndex}-${Date.now()}`,
            labour_role: lab.labour_role,
            hours: lab.hours || 8,
            rate_per_hour: lab.rate_per_hour || (lab.amount ? lab.amount / 8 : 0),
            master_labour_id: lab.labour_id,
            is_from_master: true,
            is_new: false,
            work_type: (lab.work_type || 'daily_wages') as 'piece_rate' | 'contract' | 'daily_wages'
          }))
        }));

        return {
          ...item,
          item_name: masterItem.item_name,
          description: masterItem.description || item.description,
          master_item_id: masterItem.item_id,
          overhead_percentage: masterItem.default_overhead_percentage || item.overhead_percentage,
          profit_margin_percentage: masterItem.default_profit_percentage || item.profit_margin_percentage,
          sub_items: formSubItems.length > 0 ? formSubItems : item.sub_items, // Use fetched sub-items or preserve existing
          materials: item.materials || [], // Keep existing materials at item level
          labour: item.labour || [], // Keep existing labour at item level
          is_new: false
        };
      }
      return item;
    }));

      // Close dropdown and update search term
      setItemDropdownOpen(prev => ({ ...prev, [itemId]: false }));
      setItemSearchTerms(prev => ({ ...prev, [itemId]: masterItem.item_name }));

      // Show success message if sub-items were loaded
      if (subItemsData.sub_items.length > 0) {
        toast.success(`Loaded ${subItemsData.sub_items.length} sub-item(s) with materials and labour`);
      }
    } catch (error) {
      console.error('Failed to load item details:', error);
      toast.error('Failed to load item details');
    } finally {
      setLoadingItemData(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleItemNameChange = (itemId: string, value: string) => {
    setItemSearchTerms(prev => ({ ...prev, [itemId]: value }));

    // Update item name for any item being edited
    setItems(items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          item_name: value,
          master_item_id: undefined, // Clear master reference when manually editing
          is_new: true // Mark as new/custom when manually edited
        };
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

  // Sub-item management functions
  const addSubItem = (itemId: string) => {
    const newSubItem: SubItemForm = {
      id: Date.now().toString(),
      sub_item_name: '',
      scope: '',
      size: '',
      location: '',
      brand: '',
      quantity: 1,
      unit: 'nos',
      rate: 0,
      misc_percentage: 10, // Default 10%
      overhead_profit_percentage: 25, // Default 25%
      transport_percentage: 5, // Default 5%
      materials: [],
      labour: [
        {
          id: `lab-${Date.now()}`,
          labour_role: '',
          hours: 8,
          rate_per_hour: 0,
          work_type: 'daily_wages',
          is_new: true
        }
      ],
      images: [],
      imageUrls: []
    };

    setItems(items.map(item => {
      if (item.id === itemId) {
        const updatedSubItems = [...item.sub_items, newSubItem];
        const subItemsTotal = updatedSubItems.reduce((sum, si) => sum + (si.quantity * si.rate), 0);

        return {
          ...item,
          sub_items: updatedSubItems,
          rate: subItemsTotal
        };
      }
      return item;
    }));
  };

  const removeSubItem = (itemId: string, subItemId: string) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const updatedSubItems = item.sub_items.filter(si => si.id !== subItemId);
        const subItemsTotal = updatedSubItems.reduce((sum, si) => sum + (si.quantity * si.rate), 0);

        return {
          ...item,
          sub_items: updatedSubItems,
          rate: subItemsTotal
        };
      }
      return item;
    }));
  };

  const updateSubItem = (itemId: string, subItemId: string, field: keyof SubItemForm, value: any) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const updatedSubItems = item.sub_items.map(si =>
          si.id === subItemId ? { ...si, [field]: value } : si
        );

        // Auto-calculate item rate from sub-items total
        const subItemsTotal = updatedSubItems.reduce((sum, si) => sum + (si.quantity * si.rate), 0);

        return {
          ...item,
          sub_items: updatedSubItems,
          rate: subItemsTotal // Auto-update item rate
        };
      }
      return item;
    }));
  };

  // Sub-item material management
  const addSubItemMaterial = (itemId: string, subItemId: string) => {
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
        ? {
            ...item,
            sub_items: item.sub_items.map(si =>
              si.id === subItemId
                ? { ...si, materials: [...si.materials, newMaterial] }
                : si
            )
          }
        : item
    ));
  };

  const removeSubItemMaterial = (itemId: string, subItemId: string, materialId: string) => {
    setItems(items.map(item =>
      item.id === itemId
        ? {
            ...item,
            sub_items: item.sub_items.map(si =>
              si.id === subItemId
                ? { ...si, materials: si.materials.filter(m => m.id !== materialId) }
                : si
            )
          }
        : item
    ));
  };

  const updateSubItemMaterial = (itemId: string, subItemId: string, materialId: string, field: keyof BOQMaterialForm, value: any) => {
    setItems(items.map(item =>
      item.id === itemId
        ? {
            ...item,
            sub_items: item.sub_items.map(si =>
              si.id === subItemId
                ? {
                    ...si,
                    materials: si.materials.map(m =>
                      m.id === materialId ? { ...m, [field]: value } : m
                    )
                  }
                : si
            )
          }
        : item
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
      work_type: 'daily_wages', // Default to daily wages
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

  // Helper function to map sub-item to API payload format
  const mapSubItemToPayload = (subItem: SubItemForm) => {
    const subItemCalc = calculateSubItemCost(subItem);
    return {
      sub_item_name: subItem.sub_item_name,
      scope: subItem.scope,
      size: subItem.size || null,
      location: subItem.location || null,
      brand: subItem.brand || null,
      quantity: subItem.quantity,
      unit: subItem.unit,
      rate: subItem.rate,
      per_unit_cost: subItem.rate,
      sub_item_total: subItem.quantity * subItem.rate,

      // Per-sub-item percentages
      misc_percentage: subItem.misc_percentage,
      misc_amount: subItemCalc.miscAmount,
      overhead_profit_percentage: subItem.overhead_profit_percentage,
      overhead_profit_amount: subItemCalc.overheadProfitAmount,
      transport_percentage: subItem.transport_percentage,
      transport_amount: subItemCalc.transportAmount,

      // Cost breakdown
      material_cost: subItemCalc.materialCost,
      labour_cost: subItemCalc.labourCost,
      internal_cost: subItemCalc.internalCost,
      planned_profit: subItemCalc.plannedProfit,
      actual_profit: subItemCalc.negotiableMargin,

      materials: subItem.materials?.map(material => {
        const materialTotal = material.quantity * material.unit_price;
        const materialVAT = materialTotal * ((material.vat_percentage || 0) / 100);
        return {
          material_name: material.material_name,
          quantity: material.quantity,
          unit: material.unit,
          unit_price: material.unit_price,
          total_price: materialTotal,
          description: material.description || null,
          vat_percentage: material.vat_percentage || 0,
          vat_amount: materialVAT,
          master_material_id: material.master_material_id || null
        };
      }) || [],

      labour: subItem.labour?.map(labour => ({
        labour_role: labour.labour_role,
        work_type: labour.work_type || 'daily_wages',
        hours: labour.hours,
        rate_per_hour: labour.rate_per_hour,
        total_amount: labour.hours * labour.rate_per_hour,
        master_labour_id: labour.master_labour_id || null
      })) || []
    };
  };

  // Calculate sub-item costs using TOP-DOWN approach (like PDF)
  const calculateSubItemCost = (subItem: SubItemForm) => {
    // 1. Start with Client Rate (Total amount client pays for this sub-item)
    const clientAmount = subItem.quantity * subItem.rate;

    // 2. Calculate percentages FROM the client rate (subtract approach)
    const transportAmount = clientAmount * (subItem.transport_percentage / 100);
    const overheadProfitAmount = clientAmount * (subItem.overhead_profit_percentage / 100);
    const miscAmount = clientAmount * (subItem.misc_percentage / 100);

    // 3. Calculate Internal Cost (Materials + Labour + Misc + Overhead & Profit + Transport)
    const materialCost = subItem.materials.reduce((sum, m) => sum + (m.quantity * m.unit_price), 0);
    const labourCost = subItem.labour.reduce((sum, l) => sum + (l.hours * l.rate_per_hour), 0);
    const internalCost = materialCost + labourCost + miscAmount + overheadProfitAmount + transportAmount;

    // 4. Calculate Profits
    const plannedProfit = overheadProfitAmount; // This is the profit we planned for (25% typically)
    const negotiableMargin = clientAmount - internalCost; // Actual profit after all costs including O&P

    // 5. Remaining budget for materials/labour (for reference)
    const remainingForCosts = clientAmount - transportAmount - overheadProfitAmount - miscAmount;

    return {
      clientAmount,
      transportAmount,
      overheadProfitAmount,
      miscAmount,
      materialCost,
      labourCost,
      internalCost,
      plannedProfit,
      negotiableMargin,
      remainingForCosts
    };
  };

  const calculateItemCost = (item: BOQItemForm) => {
    // NEW APPROACH: Calculate from sub-items using TOP-DOWN method
    let totalClientCost = 0;
    let totalInternalCost = 0;
    let totalPlannedProfit = 0;
    let totalActualProfit = 0;
    let totalMiscAmount = 0;
    let totalTransportAmount = 0;
    let totalOverheadProfitAmount = 0;

    // Calculate for each sub-item
    item.sub_items.forEach(subItem => {
      const subItemCalc = calculateSubItemCost(subItem);
      totalClientCost += subItemCalc.clientAmount;
      totalInternalCost += subItemCalc.internalCost;
      totalPlannedProfit += subItemCalc.plannedProfit;
      totalActualProfit += subItemCalc.negotiableMargin;
      totalMiscAmount += subItemCalc.miscAmount;
      totalTransportAmount += subItemCalc.transportAmount;
      totalOverheadProfitAmount += subItemCalc.overheadProfitAmount;
    });

    // Also add main item materials/labour if any (backward compatibility)
    const mainMaterialCost = item.materials.reduce((sum, m) => sum + (m.quantity * m.unit_price), 0);
    const mainLabourCost = item.labour.reduce((sum, l) => sum + (l.hours * l.rate_per_hour), 0);
    totalInternalCost += mainMaterialCost + mainLabourCost;

    // Calculate discount on client cost (item-level discount)
    const discountAmount = totalClientCost * (item.discount_percentage / 100);
    const afterDiscount = totalClientCost - discountAmount;

    // No VAT - selling price is same as after discount
    const sellingPrice = afterDiscount;

    // Calculate project margin (should be 0 or near 0 in ideal case, since internal cost now includes all costs including O&P)
    const projectMargin = totalClientCost - totalInternalCost;

    return {
      // New calculation results
      totalClientCost, // Total amount client pays
      totalInternalCost, // Total internal cost (materials + labour + misc + O&P + transport)
      totalPlannedProfit, // Sum of all sub-item planned profits (from O&P %)
      totalActualProfit, // Sum of all sub-item actual profits
      totalMiscAmount, // Total miscellaneous from all sub-items
      totalTransportAmount, // Total transport from all sub-items
      totalOverheadProfitAmount, // Total O&P from all sub-items
      projectMargin, // Client cost - Internal cost (should be ~0 since internal cost includes O&P)

      // For backward compatibility and display
      itemTotal: totalClientCost, // Total from all sub-items
      miscellaneousAmount: totalMiscAmount,
      overheadProfitAmount: totalOverheadProfitAmount,
      subtotal: totalClientCost, // Before discount
      discountAmount,
      afterDiscount,
      sellingPrice, // Final amount (no VAT)
      materialCost: totalInternalCost - (item.labour.reduce((sum, l) => sum + (l.hours * l.rate_per_hour), 0)),
      labourCost: item.labour.reduce((sum, l) => sum + (l.hours * l.rate_per_hour), 0) + item.sub_items.reduce((sum, si) => sum + si.labour.reduce((s, l) => s + (l.hours * l.rate_per_hour), 0), 0),
      rawMaterialsTotal: totalInternalCost
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

  const addCustomPreliminary = async () => {
    const newId = `prelim-custom-${Date.now()}`;
    const newPreliminary: PreliminaryItem = {
      id: newId,
      description: '',
      checked: false,
      isCustom: true,
      quantity: 1,
      unit: 'nos',
      rate: 0,
      amount: 0
    };

    setPreliminaries([...preliminaries, newPreliminary]);
  };

  const updatePreliminaryDescription = (id: string, description: string) => {
    // Update the description in-place - this will update the master preliminary
    setPreliminaries(preliminaries.map(item => {
      if (item.id === id) {
        return {
          ...item,
          description
        };
      }
      return item;
    }));
  };

  const updatePreliminaryField = (id: string, field: keyof PreliminaryItem, value: any) => {
    setPreliminaries(preliminaries.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        // Auto-calculate amount when quantity or rate changes
        if (field === 'quantity' || field === 'rate') {
          updated.amount = (updated.quantity || 0) * (updated.rate || 0);
        }
        return updated;
      }
      return item;
    }));
  };

  const removePreliminary = async (id: string) => {
    const itemToRemove = preliminaries.find(item => item.id === id);
    if (!itemToRemove) return;

    // If it's a master preliminary (has prelim_id), delete from master database
    if (itemToRemove.prelim_id) {
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/preliminary-master/${itemToRemove.prelim_id}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete preliminary from master database');
        }

        toast.success('Preliminary deleted from master list');
      } catch (error) {
        console.error('Error deleting preliminary:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to delete preliminary from master database');
        return; // Don't remove from UI if backend delete failed
      }
    }

    // Remove from frontend list
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

      // Check if item has sub_items with materials/labour OR direct materials/labour
      const hasSubItemsWithData = item.sub_items?.some((si: any) =>
        si.materials?.length > 0 || si.labour?.length > 0
      );
      const hasDirectData = item.materials.length > 0 || item.labour.length > 0;

      if (!hasSubItemsWithData && !hasDirectData) {
        toast.error('Each item must have at least one material or labour entry (either in sub-items or at item level)');
        return;
      }
    }

    // Save custom preliminaries to master table before submitting BOQ
    const customPrelims = preliminaries.filter(p => p.isCustom && p.description?.trim() && !p.prelim_id);

    if (customPrelims.length > 0) {
      toast.info('Saving custom preliminaries...');

      for (const customPrelim of customPrelims) {
        try {
          const result = await estimatorService.createPreliminaryMaster({
            description: customPrelim.description.trim(),
            unit: customPrelim.unit || 'nos',
            rate: customPrelim.rate || 0
          });

          if (result.success && result.data) {
            // Update the preliminary with the new master ID
            customPrelim.prelim_id = result.data.prelim_id;
          }
        } catch (error) {
          console.error('Failed to save custom preliminary:', customPrelim.description, error);
          // Continue even if one fails - dont block the entire BOQ submission
        }
      }

      // Update state with new prelim_ids
      setPreliminaries([...preliminaries]);
      toast.success('Custom preliminaries saved to master list');
    }

    setIsSubmitting(true);

    try {
      // Revision mode - Create a new revision of the BOQ
      if (isRevision && existingBoqData?.boq_id) {
        const subtotal = items.reduce((sum, item) => {
          const costs = calculateItemCost(item);
          return sum + costs.sellingPrice;
        }, 0);
        // Add preliminary amount to subtotal before calculating discount
        const combinedSubtotal = subtotal + costAmount;
        const discountAmount = combinedSubtotal * (overallDiscount / 100);

        const revisionPayload = {
          boq_name: boqName,
          discount_percentage: overallDiscount,
          discount_amount: discountAmount,
          preliminaries: {
            items: preliminaries.map(p => ({
              id: p.id,
              prelim_id: p.prelim_id, // IMPORTANT: Include database ID
              description: p.description,
              checked: p.checked,
              selected: p.checked, // Backend also checks this field
              isCustom: p.isCustom || false
            })),
            cost_details: {
              quantity: costQuantity,
              unit: costUnit,
              rate: costRate,
              amount: costAmount,
              internal_cost: preliminaryInternalCost,
              misc_percentage: preliminaryMiscPercentage,
              overhead_profit_percentage: preliminaryOverheadProfitPercentage,
              transport_percentage: preliminaryTransportPercentage,
              misc_amount: (costAmount * preliminaryMiscPercentage) / 100,
              overhead_profit_amount: (costAmount * preliminaryOverheadProfitPercentage) / 100,
              transport_amount: (costAmount * preliminaryTransportPercentage) / 100,
              planned_profit: (costAmount * preliminaryOverheadProfitPercentage) / 100,
              actual_profit: costAmount - (preliminaryInternalCost + (costAmount * preliminaryMiscPercentage) / 100 + (costAmount * preliminaryOverheadProfitPercentage) / 100 + (costAmount * preliminaryTransportPercentage) / 100)
            },
            notes: preliminaryNotes
          },
          items: items.map(item => {
            const costs = calculateItemCost(item);
            return {
              item_name: item.item_name,
              quantity: item.quantity,
              unit: item.unit,
              rate: item.rate,
              overhead_percentage: item.overhead_percentage,
              profit_margin_percentage: item.profit_margin_percentage,
              discount_percentage: item.discount_percentage,
              vat_percentage: item.vat_percentage,

              // Add calculated amounts
              item_total: costs.itemTotal,
              overhead_amount: costs.miscellaneousAmount,
              profit_margin_amount: costs.overheadProfitAmount,
              subtotal: costs.subtotal,
              discount_amount: costs.discountAmount,
              after_discount: costs.afterDiscount,
              vat_amount: costs.vatAmount,
              selling_price: costs.sellingPrice,

              // Add sub_items structure
              sub_items: item.sub_items && item.sub_items.length > 0 ? item.sub_items.map(mapSubItemToPayload) : [],

              // Item-level materials and labour for backward compatibility
              materials: item.materials && item.materials.length > 0 ? item.materials.map(material => {
                const materialTotal = material.quantity * material.unit_price;
                const materialVAT = materialTotal * ((material.vat_percentage || 0) / 100);
                return {
                  material_name: material.material_name,
                  quantity: material.quantity,
                  unit: material.unit,
                  unit_price: material.unit_price,
                  total_price: materialTotal,
                  description: material.description || null,
                  vat_percentage: material.vat_percentage || 0,
                  vat_amount: materialVAT,
                  master_material_id: material.master_material_id || null
                };
              }) : [],

              labour: item.labour && item.labour.length > 0 ? item.labour.map(labour => ({
                labour_role: labour.labour_role,
                work_type: labour.work_type || 'daily_wages',
                hours: labour.hours,
                rate_per_hour: labour.rate_per_hour,
                total_amount: labour.hours * labour.rate_per_hour,
                master_labour_id: labour.master_labour_id || null
              })) : [],

              master_item_id: item.master_item_id || null,
              is_new: item.is_new || false
            };
          })
        };

        const result = await estimatorService.revisionBOQ(existingBoqData.boq_id, revisionPayload);

        if (result.success) {
          toast.success(result.message || 'BOQ revision created successfully');
          if (onSubmit) {
            onSubmit(existingBoqData.boq_id);
          }
          onClose();
        } else {
          toast.error(result.message || 'Failed to create BOQ revision');
        }
      }
      // Edit mode - Update existing BOQ
      else if (editMode && existingBoqData?.boq_id) {
        const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const token = localStorage.getItem('access_token');

        const subtotal = items.reduce((sum, item) => {
          const costs = calculateItemCost(item);
          return sum + costs.sellingPrice;
        }, 0);
        // Add preliminary amount to subtotal before calculating discount
        const combinedSubtotal = subtotal + costAmount;
        const discountAmount = combinedSubtotal * (overallDiscount / 100);

        // Calculate combined summary for all items
        let totalMaterialCost = 0;
        let totalLabourCost = 0;
        let totalMaterialsCount = 0;
        let totalLabourCount = 0;

        const mappedItems = items.map(item => {
          const costs = calculateItemCost(item);

          // Aggregate materials and labour from sub_items
          if (item.sub_items && item.sub_items.length > 0) {
            item.sub_items.forEach(subItem => {
              if (subItem.materials && subItem.materials.length > 0) {
                totalMaterialsCount += subItem.materials.length;
                subItem.materials.forEach(mat => {
                  totalMaterialCost += (mat.quantity * mat.unit_price);
                });
              }
              if (subItem.labour && subItem.labour.length > 0) {
                totalLabourCount += subItem.labour.length;
                subItem.labour.forEach(lab => {
                  totalLabourCost += (lab.hours * lab.rate_per_hour);
                });
              }
            });
          }

          // Aggregate item-level materials and labour
          if (item.materials && item.materials.length > 0) {
            totalMaterialsCount += item.materials.length;
            item.materials.forEach(mat => {
              totalMaterialCost += (mat.quantity * mat.unit_price);
            });
          }
          if (item.labour && item.labour.length > 0) {
            totalLabourCount += item.labour.length;
            item.labour.forEach(lab => {
              totalLabourCost += (lab.hours * lab.rate_per_hour);
            });
          }

          return {
            item_name: item.item_name,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            overhead_percentage: item.overhead_percentage,
            profit_margin_percentage: item.profit_margin_percentage,
            discount_percentage: item.discount_percentage,
            vat_percentage: item.vat_percentage,

            // Add calculated amounts
            item_total: costs.itemTotal,
            overhead_amount: costs.miscellaneousAmount,
            profit_margin_amount: costs.overheadProfitAmount,
            subtotal: costs.subtotal,
            discount_amount: costs.discountAmount,
            after_discount: costs.afterDiscount,
            vat_amount: costs.vatAmount,
            selling_price: costs.sellingPrice,

            // Add sub_items structure
            sub_items: item.sub_items && item.sub_items.length > 0 ? item.sub_items.map(mapSubItemToPayload) : [],

            // Item-level materials and labour for backward compatibility
            materials: item.materials && item.materials.length > 0 ? item.materials.map(material => {
              const materialTotal = material.quantity * material.unit_price;
              const materialVAT = materialTotal * ((material.vat_percentage || 0) / 100);
              return {
                material_name: material.material_name,
                quantity: material.quantity,
                unit: material.unit,
                unit_price: material.unit_price,
                total_price: materialTotal,
                description: material.description || null,
                vat_percentage: material.vat_percentage || 0,
                vat_amount: materialVAT,
                master_material_id: material.master_material_id || null
              };
            }) : [],

            labour: item.labour && item.labour.length > 0 ? item.labour.map(labour => ({
              labour_role: labour.labour_role,
              work_type: labour.work_type || 'daily_wages',
              hours: labour.hours,
              rate_per_hour: labour.rate_per_hour,
              total_amount: labour.hours * labour.rate_per_hour,
              master_labour_id: labour.master_labour_id || null
            })) : [],

            master_item_id: item.master_item_id || null,
            is_new: item.is_new || false
          };
        });

        // Calculate total cost after discount
        const totalCostAfterDiscount = combinedSubtotal - discountAmount;

        // Calculate total item amount (sum of all item selling prices before overall discount)
        const totalItemAmount = items.reduce((sum, item) => {
          const costs = calculateItemCost(item);
          return sum + costs.sellingPrice;
        }, 0);

        const updatePayload = {
          boq_id: existingBoqData.boq_id,
          boq_name: boqName,
          discount_percentage: overallDiscount,
          discount_amount: discountAmount,
          preliminaries: {
            items: preliminaries.map(p => ({
              id: p.id,
              prelim_id: p.prelim_id, // IMPORTANT: Include database ID
              description: p.description,
              checked: p.checked,
              selected: p.checked, // Backend also checks this field
              isCustom: p.isCustom || false
            })),
            cost_details: {
              quantity: costQuantity,
              unit: costUnit,
              rate: costRate,
              amount: costAmount,
              internal_cost: preliminaryInternalCost,
              misc_percentage: preliminaryMiscPercentage,
              overhead_profit_percentage: preliminaryOverheadProfitPercentage,
              transport_percentage: preliminaryTransportPercentage,
              misc_amount: (costAmount * preliminaryMiscPercentage) / 100,
              overhead_profit_amount: (costAmount * preliminaryOverheadProfitPercentage) / 100,
              transport_amount: (costAmount * preliminaryTransportPercentage) / 100,
              planned_profit: (costAmount * preliminaryOverheadProfitPercentage) / 100,
              actual_profit: costAmount - (preliminaryInternalCost + (costAmount * preliminaryMiscPercentage) / 100 + (costAmount * preliminaryOverheadProfitPercentage) / 100 + (costAmount * preliminaryTransportPercentage) / 100)
            },
            notes: preliminaryNotes
          },
          combined_summary: {
            total_cost: totalCostAfterDiscount,
            selling_price: totalCostAfterDiscount,
            estimatedSellingPrice: totalCostAfterDiscount,
            total_item_amount: totalItemAmount,
            total_items: items.length,
            total_materials: totalMaterialsCount,
            total_labour: totalLabourCount,
            total_material_cost: totalMaterialCost,
            total_labour_cost: totalLabourCost,
            balance_amount: totalCostAfterDiscount,
            existing_purchase_amount: 0,
            new_purchase_amount: 0,
            total_purchased_amount: 0
          },
          items: mappedItems
        };

        // Determine which API endpoint to use
        // Priority 1: If isInternalRevisionMode prop is set (from Internal Revisions tab)
        // Priority 2: If BOQ status is 'rejected' (from regular estimator workflow)
        // Otherwise: Use regular update endpoint
        const boqStatus = existingBoqData.status?.toLowerCase();
        const useInternalRevisionEndpoint = isInternalRevisionMode || boqStatus === 'rejected';
        const apiEndpoint = useInternalRevisionEndpoint
          ? `${API_URL}/update_internal_boq/${existingBoqData.boq_id}`
          : `${API_URL}/boq/update_boq/${existingBoqData.boq_id}`;

        console.log('=== BOQCreationForm Edit Mode ===');
        console.log('BOQ Status:', existingBoqData.status, '(lowercase:', boqStatus, ')');
        console.log('Is Internal Revision Mode:', isInternalRevisionMode);
        console.log('Use Internal Revision Endpoint:', useInternalRevisionEndpoint);
        console.log('API Endpoint:', apiEndpoint);

        const response = await fetch(apiEndpoint, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(updatePayload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
          toast.success(result.message || 'BOQ updated successfully');
          if (onSubmit) {
            onSubmit(existingBoqData.boq_id);
          }
          onClose();
        } else {
          toast.error(result.error || 'Failed to update BOQ');
        }
      }
      // Use new_purchase endpoint for PM/SE adding extra items
      else if (isNewPurchase && existingBoqId) {
        const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const token = localStorage.getItem('access_token');

        const newPurchasePayload = {
          boq_id: existingBoqId,
          items: items.map(item => {
            const costs = calculateItemCost(item);
            return {
              item_name: item.item_name,
              quantity: item.quantity,
              unit: item.unit,
              rate: item.rate,
              overhead_percentage: item.overhead_percentage,
              profit_margin_percentage: item.profit_margin_percentage,
              discount_percentage: item.discount_percentage,
              vat_percentage: item.vat_percentage,

              // Add calculated amounts
              item_total: costs.itemTotal,
              overhead_amount: costs.miscellaneousAmount,  // "Miscellaneous" in UI
              profit_margin_amount: costs.overheadProfitAmount,  // "Overhead & Profit" in UI
              subtotal: costs.subtotal,
              discount_amount: costs.discountAmount,
              after_discount: costs.afterDiscount,
              vat_amount: costs.vatAmount,
              selling_price: costs.sellingPrice,

              // Add sub_items structure
              sub_items: item.sub_items.map(mapSubItemToPayload)
            };
          })
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
        const subtotal = items.reduce((sum, item) => {
          const costs = calculateItemCost(item);
          return sum + costs.sellingPrice;
        }, 0);
        // Add preliminary amount to subtotal before calculating discount
        const combinedSubtotal = subtotal + costAmount;
        const discountAmount = combinedSubtotal * (overallDiscount / 100);

        const payload: BOQCreatePayload = {
          project_id: selectedProjectId,
          boq_name: boqName,
          status: 'Draft',
          created_by: 'Estimator',
          discount_percentage: overallDiscount,
          discount_amount: discountAmount,
          preliminaries: {
            items: preliminaries.map(p => ({
              id: p.id,
              prelim_id: p.prelim_id, // IMPORTANT: Include database ID
              description: p.description,
              checked: p.checked,
              selected: p.checked, // Backend also checks this field
              isCustom: p.isCustom || false
            })),
            cost_details: {
              quantity: costQuantity,
              unit: costUnit,
              rate: costRate,
              amount: costAmount,
              internal_cost: preliminaryInternalCost,
              misc_percentage: preliminaryMiscPercentage,
              overhead_profit_percentage: preliminaryOverheadProfitPercentage,
              transport_percentage: preliminaryTransportPercentage,
              misc_amount: (costAmount * preliminaryMiscPercentage) / 100,
              overhead_profit_amount: (costAmount * preliminaryOverheadProfitPercentage) / 100,
              transport_amount: (costAmount * preliminaryTransportPercentage) / 100,
              planned_profit: (costAmount * preliminaryOverheadProfitPercentage) / 100,
              actual_profit: costAmount - (preliminaryInternalCost + (costAmount * preliminaryMiscPercentage) / 100 + (costAmount * preliminaryOverheadProfitPercentage) / 100 + (costAmount * preliminaryTransportPercentage) / 100)
            },
            notes: preliminaryNotes
          },
          items: items.map(item => {
            const costs = calculateItemCost(item);
            return {
              item_name: item.item_name,
              quantity: item.quantity,
              unit: item.unit,
              rate: item.rate,
              overhead_percentage: item.overhead_percentage,
              profit_margin_percentage: item.profit_margin_percentage,
              discount_percentage: item.discount_percentage,
              vat_percentage: item.vat_percentage,

              // Add calculated amounts
              item_total: costs.itemTotal,
              overhead_amount: costs.miscellaneousAmount,  // "Miscellaneous" in UI
              profit_margin_amount: costs.overheadProfitAmount,  // "Overhead & Profit" in UI
              subtotal: costs.subtotal,
              discount_amount: costs.discountAmount,
              after_discount: costs.afterDiscount,
              vat_amount: costs.vatAmount,
              selling_price: costs.sellingPrice,

              // Add sub_items structure (only if sub_items exist and have data)
              sub_items: item.sub_items && item.sub_items.length > 0 ? item.sub_items.map(subItem => ({
                sub_item_name: subItem.sub_item_name,
                scope: subItem.scope,
                size: subItem.size || null,
                location: subItem.location || null,
                brand: subItem.brand || null,
                quantity: subItem.quantity,
                unit: subItem.unit,
                rate: subItem.rate,
                per_unit_cost: subItem.rate,  // Alias for backend compatibility
                sub_item_total: subItem.quantity * subItem.rate,

                materials: subItem.materials?.map(material => {
                  const materialTotal = material.quantity * material.unit_price;
                  const materialVAT = materialTotal * ((material.vat_percentage || 0) / 100);
                  return {
                    material_name: material.material_name,
                    quantity: material.quantity,
                    unit: material.unit,
                    unit_price: material.unit_price,
                    total_price: materialTotal,
                    description: material.description || null,
                    vat_percentage: material.vat_percentage || 0,
                    vat_amount: materialVAT,
                    master_material_id: material.master_material_id || null
                  };
                }) || [],

                labour: subItem.labour?.map(labour => ({
                  labour_role: labour.labour_role,
                  work_type: labour.work_type || 'daily_wages',
                  hours: labour.hours,
                  rate_per_hour: labour.rate_per_hour,
                  total_amount: labour.hours * labour.rate_per_hour,
                  master_labour_id: labour.master_labour_id || null
                })) || []
              })) : [],

              // OLD FORMAT: Add materials/labour at item level for backward compatibility
              materials: item.materials && item.materials.length > 0 ? item.materials.map(material => ({
                material_name: material.material_name,
                quantity: material.quantity,
                unit: material.unit,
                unit_price: material.unit_price,
                total_price: material.quantity * material.unit_price,
                description: material.description || null,
                vat_percentage: material.vat_percentage || 0,
                master_material_id: material.master_material_id || null
              })) : [],

              labour: item.labour && item.labour.length > 0 ? item.labour.map(labour => ({
                labour_role: labour.labour_role,
                work_type: labour.work_type || 'daily_wages',
                hours: labour.hours,
                rate_per_hour: labour.rate_per_hour,
                total_amount: labour.hours * labour.rate_per_hour,
                master_labour_id: labour.master_labour_id || null
              })) : [],

              master_item_id: item.master_item_id || null,
              is_new: item.is_new || false
            };
          })
        };

        const result = await estimatorService.createBOQ(payload);

        if (result.success && result.boq_id) {
          toast.success(result.message);

          // Check if any sub-items have images to upload
          const hasImages = items.some(item =>
            item.sub_items && item.sub_items.some(si => si.images && si.images.length > 0)
          );

          if (hasImages) {
            toast.loading('Uploading images...', { id: 'upload-images' });
            const boqDetailsResult = await estimatorService.getBOQById(result.boq_id);

            if (boqDetailsResult.success && boqDetailsResult.data?.existing_purchase?.items) {
              const createdItems = boqDetailsResult.data.existing_purchase.items;
              let totalUploaded = 0;
              let totalFailed = 0;

              // Loop through form items to find sub-items with images
              for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
                const formItem = items[itemIndex];
                const createdItem = createdItems[itemIndex];

                if (formItem.sub_items && formItem.sub_items.length > 0 && createdItem?.sub_items) {
                  for (let subIndex = 0; subIndex < formItem.sub_items.length; subIndex++) {
                    const formSubItem = formItem.sub_items[subIndex];
                    const createdSubItem = createdItem.sub_items[subIndex];

                    // Check if this sub-item has images to upload
                    if (formSubItem.images && formSubItem.images.length > 0 && createdSubItem?.sub_item_id) {
                      try {
                        const uploadResult = await estimatorService.uploadSubItemImages(
                          createdSubItem.sub_item_id,
                          formSubItem.images
                        );

                        if (uploadResult.success) {
                          totalUploaded += formSubItem.images.length;
                        } else {
                          totalFailed += formSubItem.images.length;
                          toast.error(`Failed to upload images for ${formSubItem.sub_item_name}`);
                        }
                      } catch (error) {
                        totalFailed += formSubItem.images?.length || 0;
                      }
                    }
                  }
                }
              }

              if (totalUploaded > 0) {
                toast.success(`${totalUploaded} image(s) uploaded successfully`, { id: 'upload-images' });
              } else if (totalFailed > 0) {
                toast.error(`Failed to upload ${totalFailed} image(s)`, { id: 'upload-images' });
              } else {
                toast.dismiss('upload-images');
              }
            } else {
              toast.error('BOQ created but images upload failed. Please add images in edit mode.', { id: 'upload-images' });
            }
          }

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
                <h2 className="text-2xl font-bold text-[#243d8a]">
                  {editMode ? 'Edit BOQ' : isRevision ? 'Create BOQ Revision' : 'Create New BOQ'}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {editMode ? 'Update the Bill of Quantities details' : isRevision ? 'Create a new revision of the BOQ' : 'Build a detailed Bill of Quantities for your project'}
                </p>
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
                  style={{ overflow: 'visible' }}
                >
                  {/* Checklist Items - Show only 5 by default, expandable */}
                  <div className="space-y-2 mb-3">
                    {(preliminaryListExpanded ? preliminaries : preliminaries.slice(0, 5)).map((item) => (
                      <div
                        key={item.id}
                        onClick={() => editingPreliminaryId !== item.id && togglePreliminary(item.id)}
                        className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-purple-50 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => togglePreliminary(item.id)}
                          className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 pointer-events-none"
                          disabled={isSubmitting}
                        />
                        {editingPreliminaryId === item.id ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updatePreliminaryDescription(item.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                              placeholder="Enter preliminary item..."
                              disabled={isSubmitting}
                              autoFocus={true}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPreliminaryId(null);
                              }}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              disabled={isSubmitting}
                              title="Save changes"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                setEditingPreliminaryId(null); // Clear edit mode first
                                await removePreliminary(item.id);
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              disabled={isSubmitting}
                              title="Delete item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : item.isCustom ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updatePreliminaryDescription(item.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                              placeholder="Enter custom preliminary item..."
                              disabled={isSubmitting}
                            />
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                await removePreliminary(item.id);
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              disabled={isSubmitting}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-between group">
                            <label className="text-sm text-gray-700 cursor-pointer flex-1">
                              {item.description}
                            </label>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingPreliminaryId(item.id);
                              }}
                              className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                              disabled={isSubmitting}
                              title="Edit item"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Show More/Less Button */}
                  {preliminaries.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setPreliminaryListExpanded(!preliminaryListExpanded)}
                      className="flex items-center justify-center gap-2 w-full px-4 py-2 mb-3 text-purple-600 border border-purple-300 rounded-lg hover:bg-purple-50 transition-all font-medium text-sm"
                      disabled={isSubmitting}
                    >
                      {preliminaryListExpanded ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          Show Less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          Show More ({preliminaries.length - 5} more)
                        </>
                      )}
                    </button>
                  )}

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

                  {/* Cost Details Section - Expanded with Internal Costing */}
                  <div className="mb-6 p-4 bg-purple-50/50 rounded-lg border border-purple-200">
                    <h4 className="text-sm font-semibold text-purple-900 mb-3">Cost Details & Analysis</h4>

                    {/* Client-Facing Details */}
                    <div className="mb-4">
                      <h5 className="text-xs font-medium text-gray-600 mb-2">Client Amount</h5>
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                          <input
                            type="number"
                            placeholder="Enter quantity"
                            value={costQuantity}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            min="0"
                            step="0.01"
                            disabled={isSubmitting}
                            onChange={(e) => {
                              const qty = parseFloat(e.target.value) || 0;
                              setCostQuantity(qty);
                              setCostAmount(qty * costRate);
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
                          <input
                            type="text"
                            list="cost-unit-options"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                            value={costUnit}
                            disabled={isSubmitting}
                            onChange={(e) => setCostUnit(e.target.value)}
                            onBlur={(e) => {
                              const value = e.target.value.trim();
                              if (value) {
                                saveCustomUnit(value);
                              }
                            }}
                            placeholder="Select or type unit"
                          />
                          <datalist id="cost-unit-options">
                            {allUnitOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </datalist>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Rate</label>
                          <input
                            type="number"
                            placeholder="Enter rate"
                            value={costRate}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            min="0"
                            step="0.01"
                            disabled={isSubmitting}
                            onChange={(e) => {
                              const rate = parseFloat(e.target.value) || 0;
                              setCostRate(rate);
                              setCostAmount(costQuantity * rate);
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Client Amount</label>
                          <input
                            type="number"
                            value={costAmount}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-100 font-semibold"
                            disabled
                            readOnly
                          />
                        </div>
                      </div>
                    </div>

                    {/* Internal Cost & Percentages */}
                    <div className="mb-4 pt-4 border-t border-purple-200">
                      <h5 className="text-xs font-medium text-gray-600 mb-2">Internal Cost Breakdown</h5>
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Internal Cost</label>
                          <input
                            type="number"
                            placeholder="Enter internal cost"
                            value={preliminaryInternalCost}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            min="0"
                            step="0.01"
                            disabled={isSubmitting}
                            onChange={(e) => setPreliminaryInternalCost(parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Misc %</label>
                          <input
                            type="number"
                            value={preliminaryMiscPercentage}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            min="0"
                            max="100"
                            step="0.1"
                            disabled={isSubmitting}
                            onChange={(e) => setPreliminaryMiscPercentage(parseFloat(e.target.value) || 0)}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Amount: AED {((costAmount * preliminaryMiscPercentage) / 100).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">O&P %</label>
                          <input
                            type="number"
                            value={preliminaryOverheadProfitPercentage}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            min="0"
                            max="100"
                            step="0.1"
                            disabled={isSubmitting}
                            onChange={(e) => setPreliminaryOverheadProfitPercentage(parseFloat(e.target.value) || 0)}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Amount: AED {((costAmount * preliminaryOverheadProfitPercentage) / 100).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Transport %</label>
                          <input
                            type="number"
                            value={preliminaryTransportPercentage}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            min="0"
                            max="100"
                            step="0.1"
                            disabled={isSubmitting}
                            onChange={(e) => setPreliminaryTransportPercentage(parseFloat(e.target.value) || 0)}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Amount: AED {((costAmount * preliminaryTransportPercentage) / 100).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Profit Analysis */}
                    {(() => {
                      const miscAmount = (costAmount * preliminaryMiscPercentage) / 100;
                      const opAmount = (costAmount * preliminaryOverheadProfitPercentage) / 100;
                      const transportAmount = (costAmount * preliminaryTransportPercentage) / 100;
                      const plannedProfit = opAmount;
                      const totalInternalCost = preliminaryInternalCost + miscAmount + opAmount + transportAmount;
                      const negotiableMargin = costAmount - totalInternalCost;

                      return (
                        <div className="pt-4 border-t border-purple-200">
                          <h5 className="text-xs font-medium text-gray-600 mb-2">Profit Analysis</h5>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-blue-50 p-3 rounded-lg">
                              <p className="text-xs text-gray-600">Planned Profit</p>
                              <p className="text-lg font-bold text-blue-600">
                                AED {plannedProfit.toFixed(2)}
                              </p>
                            </div>
                            <div className={`p-3 rounded-lg ${negotiableMargin >= plannedProfit ? 'bg-green-50' : 'bg-red-50'}`}>
                              <p className="text-xs text-gray-600">Negotiable Margins</p>
                              <p className={`text-lg font-bold ${negotiableMargin >= plannedProfit ? 'text-green-600' : 'text-red-600'}`}>
                                AED {negotiableMargin.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

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
                </div>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg relative">
                    {/* Item Header */}
                    <div className="bg-gray-50 px-4 py-3">
                      <div className="flex items-center justify-between">
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
                          <div className="w-64 relative item-dropdown-container">
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
                        </div>
                        <div className="flex items-center gap-3 ml-4">
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
                    </div>

                    {/* Item Details (Expandable) */}
                    {expandedItems.includes(item.id) && (
                      <div className="p-4 space-y-4 bg-gray-50/50">
                        {/* Items Section - Green Theme (Client-Facing) */}
                        <div className="bg-gradient-to-r from-green-50 to-green-100/30 rounded-lg p-4 border-2 border-green-400 shadow-sm">
                          <div className="mb-3">
                            <h4 className="text-sm font-bold text-green-900 flex items-center gap-2">
                              <div className="p-1.5 bg-white rounded shadow-sm">
                                <FileText className="w-4 h-4 text-green-600" />
                              </div>
                              Sub Items
                            </h4>
                          </div>

                          <div className="space-y-3">
                            {item.sub_items.map((subItem, subIndex) => (
                              <div key={subItem.id} className="bg-white rounded-lg p-3 border border-green-200">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-xs font-semibold text-green-900">Sub Item #{subIndex + 1}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeSubItem(item.id, subItem.id)}
                                    className="text-red-500 hover:text-red-700"
                                    disabled={isSubmitting}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>

                                {/* Sub-item Fields */}
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                      Sub Item Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                      type="text"
                                      value={subItem.sub_item_name}
                                      onChange={(e) => updateSubItem(item.id, subItem.id, 'sub_item_name', e.target.value)}
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                      placeholder="e.g., Flooring Work"
                                      required
                                      disabled={isSubmitting}
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                      Scope <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                      type="text"
                                      value={subItem.scope}
                                      onChange={(e) => updateSubItem(item.id, subItem.id, 'scope', e.target.value)}
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                      placeholder="e.g., Tile flooring"
                                      required
                                      disabled={isSubmitting}
                                    />
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Size <span className="text-gray-400 text-xs">(Optional)</span>
                                      </label>
                                      <input
                                        type="text"
                                        value={subItem.size || ''}
                                        onChange={(e) => updateSubItem(item.id, subItem.id, 'size', e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                        placeholder="e.g., 120 cm X 60 cm"
                                        disabled={isSubmitting}
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Location <span className="text-gray-400 text-xs">(Optional)</span>
                                      </label>
                                      <input
                                        type="text"
                                        value={subItem.location || ''}
                                        onChange={(e) => updateSubItem(item.id, subItem.id, 'location', e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                        placeholder="e.g., Living room"
                                        disabled={isSubmitting}
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                      Brand <span className="text-gray-400 text-xs">(Optional)</span>
                                    </label>
                                    <input
                                      type="text"
                                      value={subItem.brand || ''}
                                      onChange={(e) => updateSubItem(item.id, subItem.id, 'brand', e.target.value)}
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                      placeholder="e.g., RAK / Equivalent"
                                      disabled={isSubmitting}
                                    />
                                  </div>

                                  {/* Image Upload Section */}
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-2">
                                      <ImageIcon className="w-3.5 h-3.5 inline mr-1" />
                                      Images <span className="text-gray-400 text-xs">(Optional)</span>
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
                                        onDrop={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          e.currentTarget.classList.remove('border-green-500', 'bg-green-50');

                                          const files = Array.from(e.dataTransfer.files).filter(
                                            file => file.type.startsWith('image/')
                                          );

                                          if (files.length > 0) {
                                            const existingImages = subItem.images || [];
                                            const existingUrls = subItem.imageUrls || [];
                                            const existingImageData = subItem.imageData || [];
                                            const newUrls = files.map(file => URL.createObjectURL(file));
                                            const newImageData = newUrls.map(url => ({ url, isExisting: false }));

                                            // Update both fields at once to avoid race condition
                                            setItems(items.map(itm => {
                                              if (itm.id === item.id) {
                                                return {
                                                  ...itm,
                                                  sub_items: itm.sub_items.map(si =>
                                                    si.id === subItem.id
                                                      ? {
                                                          ...si,
                                                          images: [...existingImages, ...files],
                                                          imageUrls: [...existingUrls, ...newUrls],
                                                          imageData: [...existingImageData, ...newImageData]
                                                        }
                                                      : si
                                                  )
                                                };
                                              }
                                              return itm;
                                            }));

                                            toast.success(`${files.length} image(s) added`);
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
                                          onChange={(e) => {
                                            const files = Array.from(e.target.files || []);
                                            if (files.length > 0) {
                                              const existingImages = subItem.images || [];
                                              const existingUrls = subItem.imageUrls || [];
                                              const existingImageData = subItem.imageData || [];
                                              const newUrls = files.map(file => URL.createObjectURL(file));
                                              const newImageData = newUrls.map(url => ({ url, isExisting: false }));

                                              // Update both fields at once to avoid race condition
                                              setItems(items.map(itm => {
                                                if (itm.id === item.id) {
                                                  return {
                                                    ...itm,
                                                    sub_items: itm.sub_items.map(si =>
                                                      si.id === subItem.id
                                                        ? {
                                                            ...si,
                                                            images: [...existingImages, ...files],
                                                            imageUrls: [...existingUrls, ...newUrls],
                                                            imageData: [...existingImageData, ...newImageData]
                                                          }
                                                        : si
                                                    )
                                                  };
                                                }
                                                return itm;
                                              }));

                                              toast.success(`${files.length} image(s) added`);
                                            }
                                            e.target.value = '';
                                          }}
                                          disabled={isSubmitting}
                                        />
                                      </label>
                                    </div>

                                    {/* Image Previews */}
                                    {subItem.imageUrls && subItem.imageUrls.length > 0 && (
                                      <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                                        <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                                          <ImageIcon className="w-3.5 h-3.5" />
                                          Attached Images ({subItem.imageUrls.length})
                                        </h5>
                                        <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                                          {subItem.imageUrls.map((url, imgIndex) => (
                                            <div
                                              key={imgIndex}
                                              className="relative group cursor-pointer"
                                            >
                                              <img
                                                src={url}
                                                alt={`Preview ${imgIndex + 1}`}
                                                className="w-full h-20 object-cover rounded-lg border border-gray-200 hover:border-green-500 transition-all"
                                                onClick={() => window.open(url, '_blank')}
                                              />
                                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all rounded-lg flex items-center justify-center pointer-events-none">
                                                <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                              </div>
                                              <button
                                                type="button"
                                                onClick={async (e) => {
                                                  e.stopPropagation();

                                                  // Check if this is an existing image from backend
                                                  const imageInfo = subItem.imageData?.[imgIndex];

                                                  if (imageInfo && imageInfo.isExisting && imageInfo.filename && subItem.master_sub_item_id) {
                                                    // Call DELETE API for existing images
                                                    try {
                                                      const response = await estimatorService.deleteSubItemImage(subItem.master_sub_item_id, imageInfo.filename);
                                                      if (response.success) {
                                                        toast.success('Image deleted from database');
                                                      } else {
                                                        toast.error('Failed to delete image');
                                                        return;
                                                      }
                                                    } catch (error) {
                                                      console.error('Failed to delete image:', error);
                                                      toast.error('Failed to delete image');
                                                      return;
                                                    }
                                                  }

                                                  const newImages = (subItem.images || []).filter((_, i) => i !== imgIndex);
                                                  const newUrls = (subItem.imageUrls || []).filter((_, i) => i !== imgIndex);
                                                  const newImageData = (subItem.imageData || []).filter((_, i) => i !== imgIndex);

                                                  // Update both fields at once to avoid race condition
                                                  setItems(items.map(itm => {
                                                    if (itm.id === item.id) {
                                                      return {
                                                        ...itm,
                                                        sub_items: itm.sub_items.map(si =>
                                                          si.id === subItem.id
                                                            ? {
                                                                ...si,
                                                                images: newImages,
                                                                imageUrls: newUrls,
                                                                imageData: newImageData
                                                              }
                                                            : si
                                                        )
                                                      };
                                                    }
                                                    return itm;
                                                  }));

                                                  // Only revoke if it's a blob URL (newly uploaded)
                                                  if (url.startsWith('blob:')) {
                                                    URL.revokeObjectURL(url);
                                                  }

                                                  if (!imageInfo?.isExisting) {
                                                    toast.success('Image removed');
                                                  }
                                                }}
                                                className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                disabled={isSubmitting}
                                              >
                                                <X className="w-3 h-3" />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-4 gap-3">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Quantity <span className="text-red-500">*</span>
                                      </label>
                                      <input
                                        type="number"
                                        value={subItem.quantity}
                                        onChange={(e) => updateSubItem(item.id, subItem.id, 'quantity', parseFloat(e.target.value) || 0)}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                        min="0"
                                        step="0.01"
                                        required
                                        disabled={isSubmitting}
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Unit <span className="text-red-500">*</span>
                                      </label>
                                      <input
                                        type="text"
                                        list={`subitem-unit-options-${item.id}-${subItem.id}`}
                                        value={subItem.unit}
                                        onChange={(e) => updateSubItem(item.id, subItem.id, 'unit', e.target.value)}
                                        onBlur={(e) => {
                                          const value = e.target.value.trim();
                                          if (value) {
                                            saveCustomUnit(value);
                                          }
                                        }}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                                        placeholder="Select or type unit"
                                        required
                                        disabled={isSubmitting}
                                      />
                                      <datalist id={`subitem-unit-options-${item.id}-${subItem.id}`}>
                                        {allUnitOptions.map(opt => (
                                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                      </datalist>
                                    </div>

                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Rate <span className="text-red-500">*</span>
                                      </label>
                                      <input
                                        type="number"
                                        value={subItem.rate}
                                        onChange={(e) => updateSubItem(item.id, subItem.id, 'rate', parseFloat(e.target.value) || 0)}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                                        min="0"
                                        step="0.01"
                                        required
                                        disabled={isSubmitting}
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">Total</label>
                                      <input
                                        type="text"
                                        value={(subItem.quantity * subItem.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 font-semibold text-gray-700"
                                        disabled
                                      />
                                    </div>
                                  </div>

                                  {/* Raw Materials Section for Sub-item (Internal) */}
                                  <div className="mt-4 pt-4 border-t border-gray-200 border-2 border-red-300 rounded-lg p-3 bg-red-50/20">
                                    <div className="mb-3">
                                      <h5 className="text-xs font-bold text-blue-900 flex items-center gap-2">
                                        <Package className="w-3.5 h-3.5 text-blue-600" />
                                        Raw Materials
                                      </h5>
                                    </div>

                                    <div className="space-y-2">
                                      {/* Column Headers */}
                                      {subItem.materials.length > 0 && (
                                        <div className="flex items-center gap-2 pb-2 border-b border-blue-200">
                                          <div className="w-10 text-xs font-semibold text-gray-700">S.No</div>
                                          <div className="flex-1 text-xs font-semibold text-gray-700">Material Name</div>
                                          <div className="w-20 text-xs font-semibold text-gray-700">Qty</div>
                                          <div className="w-24 text-xs font-semibold text-gray-700">Unit</div>
                                          <div className="w-24 text-xs font-semibold text-gray-700">Rate (AED)</div>
                                          <div className="w-24 text-xs font-semibold text-gray-700">Total (AED)</div>
                                          <div className="w-4"></div>
                                        </div>
                                      )}

                                      {subItem.materials.map((material, materialIndex) => {
                                        const materialDropdownId = `${item.id}-${subItem.id}-${material.id}`;
                                        const availableMaterials = getAvailableMaterials(item.id);

                                        return (
                                          <div key={material.id} className="space-y-1">
                                            <div className="flex items-center gap-2">
                                              <div className="w-10 flex items-center justify-center text-xs font-medium text-gray-600">
                                                {materialIndex + 1}
                                              </div>
                                              <div className="flex-1 relative">
                                                <input
                                                  type="text"
                                                  value={materialSearchTerms[materialDropdownId] || material.material_name}
                                                  onChange={(e) => {
                                                    setMaterialSearchTerms(prev => ({ ...prev, [materialDropdownId]: e.target.value }));
                                                    if (!material.is_from_master) {
                                                      updateSubItemMaterial(item.id, subItem.id, material.id, 'material_name', e.target.value);
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
                                                            // Update sub-item material with master data
                                                            updateSubItemMaterial(item.id, subItem.id, material.id, 'material_name', masterMaterial.material_name);
                                                            updateSubItemMaterial(item.id, subItem.id, material.id, 'unit', masterMaterial.default_unit);
                                                            updateSubItemMaterial(item.id, subItem.id, material.id, 'unit_price', masterMaterial.current_market_price);
                                                            updateSubItemMaterial(item.id, subItem.id, material.id, 'master_material_id', masterMaterial.material_id);
                                                            updateSubItemMaterial(item.id, subItem.id, material.id, 'is_from_master', true);
                                                            setMaterialDropdownOpen(prev => ({ ...prev, [materialDropdownId]: false }));
                                                            setMaterialSearchTerms(prev => ({ ...prev, [materialDropdownId]: masterMaterial.material_name }));
                                                          }}
                                                          className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors"
                                                        >
                                                          <div className="font-medium text-gray-900">{masterMaterial.material_name}</div>
                                                          <div className="text-xs text-gray-500">
                                                            AED{masterMaterial.current_market_price}/{masterMaterial.default_unit}
                                                          </div>
                                                        </button>
                                                      ))
                                                    }
                                                  </div>
                                                )}
                                              </div>
                                              <input
                                                type="number"
                                                value={material.quantity}
                                                onChange={(e) => updateSubItemMaterial(item.id, subItem.id, material.id, 'quantity', parseFloat(e.target.value) || 0)}
                                                className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder="Qty"
                                                min="0"
                                                step="0.01"
                                                disabled={isSubmitting}
                                              />
                                              <input
                                                type="text"
                                                list={`material-unit-options-${item.id}-${subItem.id}-${material.id}`}
                                                value={material.unit}
                                                onChange={(e) => updateSubItemMaterial(item.id, subItem.id, material.id, 'unit', e.target.value)}
                                                onBlur={(e) => {
                                                  const value = e.target.value.trim();
                                                  if (value) {
                                                    saveCustomUnit(value);
                                                  }
                                                }}
                                                className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                                placeholder="Unit"
                                                disabled={isSubmitting}
                                              />
                                              <datalist id={`material-unit-options-${item.id}-${subItem.id}-${material.id}`}>
                                                {allUnitOptions.map(opt => (
                                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                              </datalist>
                                              <input
                                                type="number"
                                                value={material.unit_price}
                                                onChange={(e) => updateSubItemMaterial(item.id, subItem.id, material.id, 'unit_price', parseFloat(e.target.value) || 0)}
                                                className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder="Rate"
                                                min="0"
                                                step="0.01"
                                                disabled={isSubmitting}
                                              />
                                              <span className="w-24 text-sm font-medium text-gray-700">
                                                {(material.quantity * material.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => removeSubItemMaterial(item.id, subItem.id, material.id)}
                                                className="text-red-500 hover:text-red-700"
                                                disabled={isSubmitting}
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            </div>
                                            {/* Description field */}
                                            <div className="ml-0">
                                              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                                              <input
                                                type="text"
                                                value={material.description || ''}
                                                onChange={(e) => updateSubItemMaterial(item.id, subItem.id, material.id, 'description', e.target.value)}
                                                className="w-full px-3 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50"
                                                placeholder="Description (optional)"
                                                disabled={isSubmitting}
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                      {subItem.materials.length === 0 && (
                                        <div className="text-center py-3 text-xs text-gray-500 bg-blue-50/30 rounded-lg">
                                          No materials added yet. Click "+ Add Material" to add one.
                                        </div>
                                      )}

                                      {/* Raw Materials Total */}
                                      {subItem.materials.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-blue-200 bg-blue-50/50 rounded-lg px-3 py-2">
                                          <div className="flex justify-between items-center">
                                            <span className="text-sm font-bold text-blue-900">Raw Materials Total:</span>
                                            <span className="text-sm font-bold text-blue-900">
                                              AED {subItem.materials.reduce((sum, m) => sum + (m.quantity * m.unit_price), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </span>
                                          </div>
                                        </div>
                                      )}

                                      {/* Add Material Button - Positioned at bottom */}
                                      <div className="mt-3 pt-3 border-t border-blue-300">
                                        <button
                                          type="button"
                                          onClick={() => addSubItemMaterial(item.id, subItem.id)}
                                          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all border border-blue-300"
                                          disabled={isSubmitting}
                                        >
                                          <Plus className="w-4 h-4" />
                                          Add Material
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Labour Section for Sub-item (Internal) */}
                                  <div className="mt-4 pt-4 border-t border-gray-200 border-2 border-red-300 rounded-lg p-3 bg-red-50/20">
                                    <div className="mb-3">
                                      <h5 className="text-xs font-bold text-orange-900 flex items-center gap-2">
                                        <Users className="w-3.5 h-3.5 text-orange-600" />
                                        Labour
                                      </h5>
                                    </div>

                                    <div className="space-y-2">
                                      {/* Column Headers for Labour */}
                                      {subItem.labour.length > 0 && (
                                        <div className="flex items-center gap-2 pb-2 border-b border-orange-200">
                                          <div className="w-10 text-xs font-semibold text-gray-700">S.No</div>
                                          <div className="flex-1 text-xs font-semibold text-gray-700">Labour Role</div>
                                          <div className="w-[100px] text-xs font-semibold text-gray-700">Work Type</div>
                                          <div className="w-20 text-xs font-semibold text-gray-700">Hours</div>
                                          <div className="w-24 text-xs font-semibold text-gray-700">Rate/hr (AED)</div>
                                          <div className="w-24 text-xs font-semibold text-gray-700">Total (AED)</div>
                                          <div className="w-4"></div>
                                        </div>
                                      )}

                                      {subItem.labour.map((labour, labourIndex) => (
                                        <div key={labour.id} className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <div className="w-10 flex items-center justify-center text-xs font-medium text-gray-600">
                                              {labourIndex + 1}
                                            </div>
                                            <input
                                              type="text"
                                              value={labour.labour_role}
                                              onChange={(e) => {
                                                setItems(items.map(itm =>
                                                  itm.id === item.id
                                                    ? {
                                                        ...itm,
                                                        sub_items: itm.sub_items.map(si =>
                                                          si.id === subItem.id
                                                            ? {
                                                                ...si,
                                                                labour: si.labour.map(l =>
                                                                  l.id === labour.id ? { ...l, labour_role: e.target.value } : l
                                                                )
                                                              }
                                                            : si
                                                        )
                                                      }
                                                    : itm
                                                ));
                                              }}
                                              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                              placeholder="Labour role (e.g., Fabricator, Installer)"
                                              disabled={isSubmitting}
                                            />
                                            <select
                                              value={labour.work_type || 'daily_wages'}
                                              onChange={(e) => {
                                                setItems(items.map(itm =>
                                                  itm.id === item.id
                                                    ? {
                                                        ...itm,
                                                        sub_items: itm.sub_items.map(si =>
                                                          si.id === subItem.id
                                                            ? {
                                                                ...si,
                                                                labour: si.labour.map(l =>
                                                                  l.id === labour.id ? { ...l, work_type: e.target.value } : l
                                                                )
                                                              }
                                                            : si
                                                        )
                                                      }
                                                    : itm
                                                ));
                                              }}
                                              className="px-3 py-1.5 text-xs border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 bg-white"
                                              disabled={isSubmitting}
                                            >
                                              <option value="piece_rate">Piece Rate</option>
                                              <option value="contract">Contract</option>
                                              <option value="daily_wages">Daily Wages</option>
                                            </select>
                                            <input
                                              type="number"
                                              value={labour.hours}
                                              onChange={(e) => {
                                                setItems(items.map(itm =>
                                                  itm.id === item.id
                                                    ? {
                                                        ...itm,
                                                        sub_items: itm.sub_items.map(si =>
                                                          si.id === subItem.id
                                                            ? {
                                                                ...si,
                                                                labour: si.labour.map(l =>
                                                                  l.id === labour.id ? { ...l, hours: parseFloat(e.target.value) || 0 } : l
                                                                )
                                                              }
                                                            : si
                                                        )
                                                      }
                                                    : itm
                                                ));
                                              }}
                                              className="w-20 px-2 py-1.5 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                                              placeholder="Hours"
                                              min="0"
                                              step="0.5"
                                              disabled={isSubmitting}
                                            />
                                            <input
                                              type="number"
                                              value={labour.rate_per_hour}
                                              onChange={(e) => {
                                                setItems(items.map(itm =>
                                                  itm.id === item.id
                                                    ? {
                                                        ...itm,
                                                        sub_items: itm.sub_items.map(si =>
                                                          si.id === subItem.id
                                                            ? {
                                                                ...si,
                                                                labour: si.labour.map(l =>
                                                                  l.id === labour.id ? { ...l, rate_per_hour: parseFloat(e.target.value) || 0 } : l
                                                                )
                                                              }
                                                            : si
                                                        )
                                                      }
                                                    : itm
                                                ));
                                              }}
                                              className="w-24 px-2 py-1.5 text-sm border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
                                              placeholder="Rate/hr"
                                              min="0"
                                              step="0.01"
                                              disabled={isSubmitting}
                                            />
                                            <span className="w-24 text-sm font-medium text-gray-700">
                                              {(labour.hours * labour.rate_per_hour).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setItems(items.map(itm =>
                                                  itm.id === item.id
                                                    ? {
                                                        ...itm,
                                                        sub_items: itm.sub_items.map(si =>
                                                          si.id === subItem.id
                                                            ? { ...si, labour: si.labour.filter(l => l.id !== labour.id) }
                                                            : si
                                                        )
                                                      }
                                                    : itm
                                                ));
                                              }}
                                              className="text-red-500 hover:text-red-700"
                                              disabled={isSubmitting}
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                      {subItem.labour.length === 0 && (
                                        <div className="text-center py-3 text-xs text-gray-500 bg-orange-50/30 rounded-lg">
                                          No labour added yet. Click "+ Add Labour" to add one.
                                        </div>
                                      )}

                                      {/* Labour Total */}
                                      {subItem.labour.length > 0 && (
                                        <div className="mt-3 pt-3 border-t border-orange-200 flex justify-between items-center bg-orange-50/50 rounded-lg px-3 py-2">
                                          <span className="text-sm font-bold text-orange-900">Labour Total:</span>
                                          <span className="text-sm font-bold text-orange-900">
                                            AED {subItem.labour.reduce((sum, l) => sum + (l.hours * l.rate_per_hour), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                          </span>
                                        </div>
                                      )}

                                      {/* Add Labour Button - Positioned at bottom */}
                                      <div className="mt-3 pt-3 border-t border-orange-300">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newLabour: BOQLabourForm = {
                                              id: Date.now().toString(),
                                              labour_role: '',
                                              hours: 8,
                                              rate_per_hour: 0,
                                              is_new: true
                                            };
                                            setItems(items.map(itm =>
                                              itm.id === item.id
                                                ? {
                                                    ...itm,
                                                    sub_items: itm.sub_items.map(si =>
                                                      si.id === subItem.id
                                                        ? { ...si, labour: [...si.labour, newLabour] }
                                                        : si
                                                    )
                                                  }
                                                : itm
                                            ));
                                          }}
                                          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg transition-all border border-orange-300"
                                          disabled={isSubmitting}
                                        >
                                          <Plus className="w-4 h-4" />
                                          Add Labour
                                        </button>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Cost Breakdown Percentages - After Labour */}
                                  <div className="mt-4 p-3 bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200">
                                    <h5 className="text-xs font-bold text-purple-900 mb-2 flex items-center gap-1">
                                      <Calculator className="w-3.5 h-3.5" />
                                      Cost Breakdown Percentages
                                    </h5>
                                    <div className="grid grid-cols-3 gap-3">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                          Misc %
                                        </label>
                                        <input
                                          type="number"
                                          value={subItem.misc_percentage}
                                          onChange={(e) => updateSubItem(item.id, subItem.id, 'misc_percentage', parseFloat(e.target.value) || 0)}
                                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                          min="0"
                                          max="100"
                                          step="0.1"
                                          disabled={isSubmitting}
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                          Overhead & Profit %
                                        </label>
                                        <input
                                          type="number"
                                          value={subItem.overhead_profit_percentage}
                                          onChange={(e) => updateSubItem(item.id, subItem.id, 'overhead_profit_percentage', parseFloat(e.target.value) || 0)}
                                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                          min="0"
                                          max="100"
                                          step="0.1"
                                          disabled={isSubmitting}
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                          Transport %
                                        </label>
                                        <input
                                          type="number"
                                          value={subItem.transport_percentage}
                                          onChange={(e) => updateSubItem(item.id, subItem.id, 'transport_percentage', parseFloat(e.target.value) || 0)}
                                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                          min="0"
                                          max="100"
                                          step="0.1"
                                          disabled={isSubmitting}
                                        />
                                      </div>
                                    </div>

                                    {/* Show calculated amounts */}
                                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                                      <div className="text-center">
                                        <span className="text-gray-600">Misc:</span>
                                        <span className="ml-1 font-semibold text-purple-700">
                                          {((subItem.quantity * subItem.rate) * (subItem.misc_percentage / 100)).toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED
                                        </span>
                                      </div>
                                      <div className="text-center">
                                        <span className="text-gray-600">O&P:</span>
                                        <span className="ml-1 font-semibold text-purple-700">
                                          {((subItem.quantity * subItem.rate) * (subItem.overhead_profit_percentage / 100)).toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED
                                        </span>
                                      </div>
                                      <div className="text-center">
                                        <span className="text-gray-600">Trans:</span>
                                        <span className="ml-1 font-semibold text-purple-700">
                                          {((subItem.quantity * subItem.rate) * (subItem.transport_percentage / 100)).toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Profit Analysis - Planned vs Actual */}
                                  {(() => {
                                    const subItemCalc = calculateSubItemCost(subItem);
                                    return (
                                      <div className="mt-4 p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg border-2 border-green-300">
                                        <div className="flex items-center justify-between mb-3">
                                          <h5 className="text-xs font-bold text-green-900 flex items-center gap-2">
                                            <Info className="w-4 h-4" />
                                            Profit Analysis (Top-Down Calculation)
                                          </h5>
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button className="p-1 hover:bg-green-200 rounded-full transition-colors" title="View Calculation Formulas">
                                                <HelpCircle className="w-4 h-4 text-green-700" />
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-96 bg-white">
                                              <div className="space-y-3">
                                                <h6 className="font-bold text-sm text-gray-900 border-b pb-2">BOQ Calculation Formulas</h6>
                                                <div className="space-y-2 text-xs">
                                                  <div className="bg-blue-50 p-2 rounded">
                                                    <strong className="text-blue-900">Client Amount:</strong>
                                                    <p className="text-gray-700 mt-1">= Quantity × Rate</p>
                                                  </div>
                                                  <div className="bg-orange-50 p-2 rounded">
                                                    <strong className="text-orange-900">Materials Cost:</strong>
                                                    <p className="text-gray-700 mt-1">= Sum of all material costs</p>
                                                  </div>
                                                  <div className="bg-purple-50 p-2 rounded">
                                                    <strong className="text-purple-900">Labour Cost:</strong>
                                                    <p className="text-gray-700 mt-1">= Sum of all labour costs</p>
                                                  </div>
                                                  <div className="bg-yellow-50 p-2 rounded">
                                                    <strong className="text-yellow-900">Misc:</strong>
                                                    <p className="text-gray-700 mt-1">= Client Amount × (Misc % / 100)</p>
                                                  </div>
                                                  <div className="bg-indigo-50 p-2 rounded">
                                                    <strong className="text-indigo-900">Overhead & Profit:</strong>
                                                    <p className="text-gray-700 mt-1">= Client Amount × (O&P % / 100)</p>
                                                  </div>
                                                  <div className="bg-teal-50 p-2 rounded">
                                                    <strong className="text-teal-900">Transport:</strong>
                                                    <p className="text-gray-700 mt-1">= Client Amount × (Transport % / 100)</p>
                                                  </div>
                                                  <div className="bg-red-50 p-2 rounded border-2 border-red-200">
                                                    <strong className="text-red-900">Internal Cost (Total):</strong>
                                                    <p className="text-gray-700 mt-1">= Materials + Labour + Misc + O&P + Transport</p>
                                                  </div>
                                                  <div className="bg-green-50 p-2 rounded border-2 border-green-200">
                                                    <strong className="text-green-900">Planned Profit:</strong>
                                                    <p className="text-gray-700 mt-1">= Overhead & Profit amount</p>
                                                  </div>
                                                  <div className="bg-emerald-50 p-2 rounded border-2 border-emerald-200">
                                                    <strong className="text-emerald-900">Negotiable Margins:</strong>
                                                    <p className="text-gray-700 mt-1">= Client Amount - Internal Cost (Total)</p>
                                                    <p className="text-gray-500 text-xs mt-0.5 italic">Shows actual profit after all costs including O&P</p>
                                                  </div>
                                                </div>
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        </div>

                                        <div className="space-y-2 text-xs">
                                          {/* Breakdown */}
                                          <div className="space-y-1.5">
                                            <div className="flex justify-between text-gray-600">
                                              <span>Client Amount:</span>
                                              <span className="font-semibold text-gray-800">{subItemCalc.clientAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED</span>
                                            </div>
                                            <div className="flex justify-between text-gray-600">
                                              <span>Materials Cost:</span>
                                              <span className="font-semibold text-gray-800">{subItemCalc.materialCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED</span>
                                            </div>
                                            <div className="flex justify-between text-gray-600">
                                              <span>Labour Cost:</span>
                                              <span className="font-semibold text-gray-800">{subItemCalc.labourCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED</span>
                                            </div>
                                            <div className="flex justify-between text-gray-600">
                                              <span>Misc ({subItem.misc_percentage}%):</span>
                                              <span className="font-semibold text-gray-800">{subItemCalc.miscAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED</span>
                                            </div>
                                            <div className="flex justify-between text-gray-600">
                                              <span>Overhead & Profit ({subItem.overhead_profit_percentage}%):</span>
                                              <span className="font-semibold text-gray-800">{subItemCalc.overheadProfitAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED</span>
                                            </div>
                                            <div className="flex justify-between text-gray-600">
                                              <span>Transport ({subItem.transport_percentage}%):</span>
                                              <span className="font-semibold text-gray-800">{subItemCalc.transportAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED</span>
                                            </div>
                                            <div className="flex justify-between text-gray-600 mt-2 pt-2 border-t border-gray-300">
                                              <span className="font-bold">Internal Cost (Total):</span>
                                              <span className="font-bold text-red-600">{subItemCalc.internalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED</span>
                                            </div>
                                          </div>

                                          {/* Planned Profit - Moved below Internal Cost */}
                                          <div className="flex justify-between items-center p-2 bg-white/60 rounded mt-3 pt-3 border-t border-green-200">
                                            <div>
                                              <span className="font-medium text-gray-700">Planned Profit</span>
                                              <span className="ml-2 text-gray-500 italic">(from {subItem.overhead_profit_percentage}% O&P)</span>
                                            </div>
                                            <span className="font-bold text-green-700">
                                              {subItemCalc.plannedProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED
                                            </span>
                                          </div>

                                          {/* Negotiable Margins - Moved below Planned Profit */}
                                          <div className="flex justify-between items-center p-2 bg-white/60 rounded">
                                            <div>
                                              <span className="font-medium text-gray-700">Negotiable Margins</span>
                                              <span className="ml-2 text-gray-500 italic">(Client - Internal Cost Total)</span>
                                            </div>
                                            <span className={`font-bold ${subItemCalc.negotiableMargin >= subItemCalc.plannedProfit ? 'text-emerald-700' : 'text-red-600'}`}>
                                              {subItemCalc.negotiableMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED
                                            </span>
                                          </div>

                                          {/* Alert if actual < planned */}
                                          {subItemCalc.negotiableMargin < subItemCalc.plannedProfit && (
                                            <div className="mt-3 p-2 bg-red-100 border border-red-300 rounded text-red-800">
                                              <strong>⚠️ Warning:</strong> Negotiable Margins is lower than planned! Review material/labour costs.
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            ))}

                            {item.sub_items.length === 0 && (
                              <div className="text-center py-4 text-xs text-gray-500">
                                No sub items added yet. Click "+ Add Sub Item" to add one.
                              </div>
                            )}

                            {/* Add Sub Item Button - Positioned at bottom */}
                            <div className="mt-3 pt-3 border-t border-green-300">
                              <button
                                type="button"
                                onClick={() => addSubItem(item.id)}
                                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-all border border-green-300"
                                disabled={isSubmitting}
                              >
                                <Plus className="w-4 h-4" />
                                Add Sub Item
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Cost Analysis Section - Per Item (Like PDF) */}
                        {(() => {
                          const costs = calculateItemCost(item);

                          // Calculate this item's share of the overall discount
                          const totalClientCostAllItems = items.reduce((total, i) => {
                            const c = calculateItemCost(i);
                            return total + c.totalClientCost;
                          }, 0);

                          const itemDiscountShare = overallDiscount > 0 && totalClientCostAllItems > 0
                            ? (costs.totalClientCost / totalClientCostAllItems) * overallDiscount
                            : 0;

                          const itemDiscountAmount = costs.totalClientCost * (itemDiscountShare / 100);
                          const clientCostAfterDiscount = costs.totalClientCost - itemDiscountAmount;
                          const negotiableMarginAfterDiscount = clientCostAfterDiscount - costs.totalInternalCost;

                          return (
                            <div className="mt-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border-2 border-amber-300 shadow-lg">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <div className="p-1.5 bg-white rounded shadow-sm">
                                    <Calculator className="w-4 h-4 text-amber-600" />
                                  </div>
                                  <h5 className="text-sm font-bold text-amber-900">Cost Analysis</h5>
                                </div>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className="p-1 hover:bg-amber-200 rounded-full transition-colors" title="View Calculation Formulas">
                                      <HelpCircle className="w-4 h-4 text-amber-700" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-96 bg-white">
                                    <div className="space-y-3">
                                      <h6 className="font-bold text-sm text-gray-900 border-b pb-2">Cost Analysis Formulas</h6>
                                      <div className="space-y-2 text-xs">
                                        <div className="bg-blue-50 p-2 rounded">
                                          <strong className="text-blue-900">Client Cost (Total):</strong>
                                          <p className="text-gray-700 mt-1">= Sum of all sub-items (Quantity × Rate)</p>
                                        </div>
                                        <div className="bg-red-50 p-2 rounded border-2 border-red-200">
                                          <strong className="text-red-900">Internal Cost (Total):</strong>
                                          <p className="text-gray-700 mt-1">= Materials + Labour + Misc + O&P + Transport</p>
                                          <p className="text-gray-500 text-xs mt-0.5 italic">Includes ALL operational costs and planned profit</p>
                                        </div>
                                        <div className="bg-green-50 p-2 rounded">
                                          <strong className="text-green-900">Project Margin:</strong>
                                          <p className="text-gray-700 mt-1">= Client Cost - Internal Cost</p>
                                          <p className="text-gray-500 text-xs mt-0.5 italic">Should be near zero in a well-planned BOQ</p>
                                        </div>
                                        <div className="bg-indigo-50 p-2 rounded border-2 border-indigo-200">
                                          <strong className="text-indigo-900">Planned Profit:</strong>
                                          <p className="text-gray-700 mt-1">= Total O&P amount</p>
                                          <p className="text-gray-500 text-xs mt-0.5 italic">Target profit from Overhead & Profit %</p>
                                        </div>
                                        <div className="bg-emerald-50 p-2 rounded border-2 border-emerald-200">
                                          <strong className="text-emerald-900">Negotiable Margins:</strong>
                                          <p className="text-gray-700 mt-1">= Client Cost - Internal Cost (Total)</p>
                                          <p className="text-gray-500 text-xs mt-0.5 italic">Real profit after all operational costs including O&P</p>
                                        </div>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="bg-white rounded-lg p-4 space-y-3">
                                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                                  <span className="text-sm font-semibold text-gray-700">
                                    Client Cost {overallDiscount > 0 ? '(Before Discount)' : ''}
                                  </span>
                                  <span className="text-lg font-bold text-blue-700">
                                    {costs.totalClientCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED
                                  </span>
                                </div>

                                {overallDiscount > 0 && (
                                  <div className="flex justify-between items-center py-1 bg-blue-50 rounded px-2 -mt-1">
                                    <span className="text-xs font-medium text-blue-700">After {itemDiscountShare.toFixed(1)}% Discount:</span>
                                    <span className="text-sm font-bold text-blue-900">
                                      {clientCostAfterDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED
                                    </span>
                                  </div>
                                )}

                                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                                  <span className="text-sm font-semibold text-gray-700">Internal Cost</span>
                                  <span className="text-lg font-bold text-red-600">
                                    {costs.totalInternalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED
                                  </span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                  <div>
                                    <span className="text-sm font-semibold text-gray-700">Project Margin</span>
                                    <div className="text-xs text-gray-500 italic">(Excluding planned profit of {costs.totalPlannedProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED)</div>
                                  </div>
                                  <span className={`text-lg font-bold ${costs.projectMargin >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                    {costs.projectMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED
                                  </span>
                                </div>

                                {/* Breakdown Details */}
                                <div className="mt-4 pt-4 border-t-2 border-amber-200 space-y-2 text-xs">
                                  <div className="font-semibold text-gray-800 mb-2">Detailed Breakdown:</div>
                                  <div className="flex justify-between text-gray-600">
                                    <span>Total Misc Amount:</span>
                                    <span className="font-semibold">{costs.totalMiscAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED</span>
                                  </div>
                                  <div className="flex justify-between text-gray-600">
                                    <span>Total Overhead & Profit:</span>
                                    <span className="font-semibold">{costs.totalOverheadProfitAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED</span>
                                  </div>
                                  <div className="flex justify-between text-gray-600">
                                    <span>Total Transport:</span>
                                    <span className="font-semibold">{costs.totalTransportAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED</span>
                                  </div>
                                  <div className="flex justify-between font-semibold text-green-700 pt-2 border-t border-gray-300">
                                    <span>Total Planned Profit:</span>
                                    <span>{costs.totalPlannedProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED</span>
                                  </div>
                                  <div className="flex justify-between font-semibold text-emerald-700">
                                    <span>Total Negotiable Margins {overallDiscount > 0 ? '(Before Discount)' : ''}:</span>
                                    <span>{costs.totalActualProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED</span>
                                  </div>

                                  {overallDiscount > 0 && (
                                    <div className="flex justify-between font-semibold text-indigo-700 bg-indigo-50 rounded px-2 py-1">
                                      <span>Negotiable Margins (After Discount):</span>
                                      <span className={negotiableMarginAfterDiscount >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                                        {negotiableMarginAfterDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} AED
                                      </span>
                                    </div>
                                  )}
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

              {/* Add Item Button - Positioned at bottom */}
              <div className="mt-4">
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

            {/* Grand Total Summary with Overall Discount */}
            {items.length > 0 && (() => {
              const itemsSubtotal = items.reduce((total, item) => {
                const costs = calculateItemCost(item);
                return total + costs.totalClientCost;
              }, 0);

              const totalInternalCost = items.reduce((total, item) => {
                const costs = calculateItemCost(item);
                return total + costs.totalInternalCost;
              }, 0);

              // Add preliminary amount to subtotal
              const preliminaryAmount = costAmount || 0;
              const combinedSubtotal = itemsSubtotal + preliminaryAmount;

              const totalActualProfit = itemsSubtotal - totalInternalCost;
              const profitMarginPercentage = itemsSubtotal > 0 ? (totalActualProfit / itemsSubtotal) * 100 : 0;

              // Calculate suggested discount: Keep at least 15% profit margin
              const minProfitMargin = 15; // 15% minimum recommended profit
              const maxSafeDiscount = Math.max(0, profitMarginPercentage - minProfitMargin);
              const suggestedDiscount = Math.min(maxSafeDiscount, 10); // Cap at 10% max

              // Calculate preliminaries profit analysis FIRST (before using in combined calculations)
              const preliminaryMiscAmount = (costAmount * preliminaryMiscPercentage) / 100;
              const preliminaryOPAmount = (costAmount * preliminaryOverheadProfitPercentage) / 100;
              const preliminaryTransportAmount = (costAmount * preliminaryTransportPercentage) / 100;
              const preliminaryPlannedProfit = preliminaryOPAmount;
              const preliminaryTotalInternalCost = preliminaryInternalCost + preliminaryMiscAmount + preliminaryOPAmount + preliminaryTransportAmount;
              const preliminaryActualProfit = costAmount - preliminaryTotalInternalCost;

              // Combined totals (calculate before using in discount calculations)
              const combinedInternalCost = totalInternalCost + preliminaryTotalInternalCost;
              const combinedPlannedProfit = items.reduce((sum, item) => {
                const costs = calculateItemCost(item);
                return sum + costs.totalPlannedProfit;
              }, 0) + preliminaryPlannedProfit;
              const combinedActualProfit = totalActualProfit + preliminaryActualProfit;

              // Apply discount to combined subtotal (items + preliminary)
              const discountAmount = combinedSubtotal * (overallDiscount / 100);
              const grandTotal = combinedSubtotal - discountAmount;

              // Calculate profit after discount (using combined internal cost including preliminaries)
              const negotiableMarginAfterDiscount = grandTotal - combinedInternalCost;
              const profitMarginAfterDiscount = grandTotal > 0 ? (negotiableMarginAfterDiscount / grandTotal) * 100 : 0;

              return (
                <>
                  {/* Cost Analysis Summary - BOQ Items + Preliminaries */}
                  {(items.length > 0 || costAmount > 0) && (
                    <div className="mt-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border-2 border-amber-300 shadow-xl">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-gradient-to-br from-amber-100 to-amber-200 rounded-xl shadow-md">
                          <Calculator className="w-6 h-6 text-amber-600" />
                        </div>
                        <h3 className="text-xl font-bold text-amber-900">Cost Analysis Summary</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* BOQ Items Analysis */}
                        {items.length > 0 && (
                          <div className="bg-white rounded-xl p-4 border border-amber-200">
                            <h4 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b">BOQ Items</h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Client Cost:</span>
                                <span className="font-semibold text-blue-700">{itemsSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Internal Cost:</span>
                                <span className="font-semibold text-red-600">{totalInternalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between pt-2 border-t">
                                <span className="text-gray-600">Planned Profit:</span>
                                <span className="font-semibold text-indigo-600">
                                  {items.reduce((sum, item) => {
                                    const costs = calculateItemCost(item);
                                    return sum + costs.totalPlannedProfit;
                                  }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Negotiable Margins:</span>
                                <span className={`font-semibold ${totalActualProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {totalActualProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Preliminaries Analysis */}
                        {costAmount > 0 && (
                          <div className="bg-white rounded-xl p-4 border border-purple-200">
                            <h4 className="text-sm font-bold text-gray-800 mb-3 pb-2 border-b">Preliminaries & Approvals</h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Client Amount:</span>
                                <span className="font-semibold text-blue-700">{costAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Internal Cost:</span>
                                <span className="font-semibold text-red-600">{preliminaryTotalInternalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between pt-2 border-t">
                                <span className="text-gray-600">Planned Profit:</span>
                                <span className="font-semibold text-indigo-600">{preliminaryPlannedProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Negotiable Margins:</span>
                                <span className={`font-semibold ${preliminaryActualProfit >= preliminaryPlannedProfit ? 'text-green-600' : 'text-red-600'}`}>
                                  {preliminaryActualProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Combined Totals */}
                      {items.length > 0 && costAmount > 0 && (
                        <div className="mt-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border-2 border-green-300">
                          <h4 className="text-sm font-bold text-green-900 mb-3">Combined Totals (BOQ + Preliminaries)</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="text-center">
                              <p className="text-xs text-gray-600 mb-1">Total Client</p>
                              <p className="text-lg font-bold text-blue-700">{combinedSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-600 mb-1">Total Internal</p>
                              <p className="text-lg font-bold text-red-600">{combinedInternalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-600 mb-1">Planned Profit</p>
                              <p className="text-lg font-bold text-indigo-600">{combinedPlannedProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-gray-600 mb-1">Negotiable Margins</p>
                              <p className={`text-lg font-bold ${combinedActualProfit >= combinedPlannedProfit ? 'text-green-600' : 'text-red-600'}`}>
                                {combinedActualProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Total Project Value */}
                <div className="mt-6 bg-gradient-to-r from-green-50 to-green-100 rounded-2xl p-6 border-2 border-green-300 shadow-xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-br from-green-100 to-green-200 rounded-xl shadow-md">
                      <Calculator className="w-6 h-6 text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold text-green-900">Total Project Value</h3>
                  </div>

                  <div className="bg-white rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 font-medium">Items Subtotal:</span>
                      <span className="text-lg font-semibold text-gray-900">
                        AED {itemsSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Preliminary Amount */}
                    {preliminaryAmount > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700 font-medium">Preliminary Amount:</span>
                        <span className="text-lg font-semibold text-gray-900">
                          AED {preliminaryAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {/* Combined Subtotal */}
                    {preliminaryAmount > 0 && (
                      <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                        <span className="text-gray-800 font-semibold">Combined Subtotal:</span>
                        <span className="text-xl font-bold text-gray-900">
                          AED {combinedSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {/* Overall Discount Input with Suggestion */}
                    <div className="py-2 border-t border-gray-200">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-gray-700 font-medium">Overall Discount:</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={overallDiscount === 0 ? '' : overallDiscount}
                              onChange={(e) => {
                                const value = e.target.value === '' ? 0 : Number(e.target.value);
                                setOverallDiscount(Math.max(0, Math.min(100, value)));
                              }}
                              className="w-20 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                              min="0"
                              max="100"
                              step="0.1"
                              disabled={isSubmitting}
                              placeholder="0"
                            />
                            <span className="text-sm text-gray-600">%</span>
                          </div>
                        </div>
                        <span className="text-lg font-semibold text-red-600">
                          - AED {discountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Suggested Discount */}
                      {suggestedDiscount > 0 && (
                        <div className="flex items-center gap-2 text-xs">
                          <Info className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-gray-600">Suggested safe discount:</span>
                          <button
                            type="button"
                            onClick={() => setOverallDiscount(Math.floor(suggestedDiscount * 10) / 10)}
                            className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-semibold transition-colors"
                            disabled={isSubmitting}
                          >
                            {(Math.floor(suggestedDiscount * 10) / 10).toFixed(1)}%
                          </button>
                          <span className="text-gray-500 italic">(maintains {minProfitMargin}% profit margin)</span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t-2 border-green-300">
                      <span className="text-xl font-bold text-green-900">
                        Grand Total: <span className="text-sm font-normal text-gray-600">(Excluding VAT)</span>
                      </span>
                      <span className="text-3xl font-bold text-green-900">
                        AED {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Show impact of discount on profit */}
                    {overallDiscount > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3">
                        <h6 className="text-xs font-bold text-gray-800 mb-3 flex items-center gap-2">
                          <TrendingUp className="w-3.5 h-3.5" />
                          Discount Impact on Profitability
                        </h6>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">Client Cost:</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 line-through">
                                {combinedSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-blue-700 font-bold">
                                → {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">Internal Cost:</span>
                            <span className="font-semibold text-red-600">
                              {combinedInternalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                            <span className="text-gray-700 font-medium">Negotiable Margins:</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 line-through">
                                {combinedActualProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                              <span className={`font-bold ${negotiableMarginAfterDiscount >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                → {negotiableMarginAfterDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center bg-white/60 rounded px-2 py-1">
                            <span className="text-gray-700 font-medium">Profit Margin:</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 text-xs">
                                {profitMarginPercentage.toFixed(1)}%
                              </span>
                              <span className={`font-bold ${profitMarginAfterDiscount >= 15 ? 'text-emerald-700' : profitMarginAfterDiscount >= 10 ? 'text-orange-600' : 'text-red-600'}`}>
                                → {profitMarginAfterDiscount.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          {profitMarginAfterDiscount < 15 && (
                            <div className="mt-2 p-2 bg-orange-100 border border-orange-300 rounded text-orange-800 flex items-start gap-2">
                              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              <span className="text-xs">
                                <strong>Warning:</strong> Profit margin is below recommended 15%. Consider reducing the discount.
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                </>
              );
            })()}
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
              {!hideTemplate && !editMode && (
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
              {!hideBulkUpload && !hideTemplate && !editMode && (
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
                    {editMode ? 'Updating BOQ...' : isRevision ? 'Creating Revision...' : isNewPurchase ? 'Adding Items...' : 'Creating BOQ...'}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {editMode ? 'Update BOQ' : isRevision ? 'Create Revision' : isNewPurchase ? 'Add Items' : 'Create BOQ'}
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