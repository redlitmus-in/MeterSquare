import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowDownCircle, Package, Plus, Search, FileText, CheckCircle, DollarSign, ChevronDown, X, Download, ExternalLink, Truck, Bell } from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { inventoryService, InventoryMaterial, CustomUnit } from '../services/inventoryService';
import { apiClient } from '@/api/config';

// Buyer Transfer Interface
interface BuyerTransfer {
  delivery_note_id: number;
  delivery_note_number: string;
  project_name: string;
  delivery_date: string | null;
  vehicle_number: string | null;
  driver_name: string | null;
  driver_contact: string | null;
  transport_fee: number | null;
  notes: string | null;
  status: string;
  created_by: string;
  created_at: string | null;
  items: {
    item_id: number;
    inventory_material_id: number;
    material_name: string;
    material_code: string | null;
    quantity: number;
    unit: string;
    unit_price: number | null;
  }[];
  total_items: number;
  total_quantity: number;
}
import ConfirmationModal from '../components/ConfirmationModal';

interface PurchaseTransaction {
  inventory_transaction_id?: number;
  inventory_material_id: number;
  material_code?: string;
  material_name?: string;
  brand?: string;
  size?: string;
  category?: string;
  unit?: string;
  transaction_type: 'PURCHASE';
  quantity: number;
  unit_price: number;
  total_amount: number;
  reference_number?: string;
  notes?: string;
  delivery_note_url?: string;  // URL to delivery note file
  // Transport/Delivery fields
  driver_name?: string;
  vehicle_number?: string;
  transport_fee?: number;
  transport_notes?: string;
  delivery_batch_ref?: string;  // e.g., "DB-2026-001"
  created_at?: string;
  created_by?: string;
}

// Predefined units organized by category
const PREDEFINED_UNITS = [
  // Count Units
  { value: 'pcs', label: 'Pieces (pcs)', category: 'Count Units' },
  { value: 'nos', label: 'Numbers (nos)', category: 'Count Units' },
  { value: 'units', label: 'Units', category: 'Count Units' },
  { value: 'sets', label: 'Sets', category: 'Count Units' },
  { value: 'pairs', label: 'Pairs', category: 'Count Units' },
  { value: 'dozen', label: 'Dozen', category: 'Count Units' },

  // Length Units
  { value: 'mm', label: 'Millimeters (mm)', category: 'Length Units' },
  { value: 'cm', label: 'Centimeters (cm)', category: 'Length Units' },
  { value: 'm', label: 'Meters (m)', category: 'Length Units' },
  { value: 'km', label: 'Kilometers (km)', category: 'Length Units' },
  { value: 'in', label: 'Inches (in)', category: 'Length Units' },
  { value: 'ft', label: 'Feet (ft)', category: 'Length Units' },
  { value: 'yd', label: 'Yards (yd)', category: 'Length Units' },
  { value: 'rft', label: 'Running Feet (rft)', category: 'Length Units' },
  { value: 'rm', label: 'Running Meters (rm)', category: 'Length Units' },

  // Area Units
  { value: 'sqmm', label: 'Square Millimeters (sq.mm)', category: 'Area Units' },
  { value: 'sqcm', label: 'Square Centimeters (sq.cm)', category: 'Area Units' },
  { value: 'sqm', label: 'Square Meters (sq.m)', category: 'Area Units' },
  { value: 'sqft', label: 'Square Feet (sq.ft)', category: 'Area Units' },
  { value: 'sqyd', label: 'Square Yards (sq.yd)', category: 'Area Units' },
  { value: 'acre', label: 'Acres', category: 'Area Units' },
  { value: 'hectare', label: 'Hectares (ha)', category: 'Area Units' },

  // Volume Units
  { value: 'cum', label: 'Cubic Meters (cu.m)', category: 'Volume Units' },
  { value: 'cuft', label: 'Cubic Feet (cu.ft)', category: 'Volume Units' },
  { value: 'cuyd', label: 'Cubic Yards (cu.yd)', category: 'Volume Units' },
  { value: 'L', label: 'Liters (L)', category: 'Volume Units' },
  { value: 'mL', label: 'Milliliters (mL)', category: 'Volume Units' },
  { value: 'gal', label: 'Gallons (gal)', category: 'Volume Units' },

  // Weight/Mass Units
  { value: 'mg', label: 'Milligrams (mg)', category: 'Weight/Mass Units' },
  { value: 'g', label: 'Grams (g)', category: 'Weight/Mass Units' },
  { value: 'kg', label: 'Kilograms (kg)', category: 'Weight/Mass Units' },
  { value: 'ton', label: 'Metric Tons (ton)', category: 'Weight/Mass Units' },
  { value: 'lb', label: 'Pounds (lb)', category: 'Weight/Mass Units' },
  { value: 'oz', label: 'Ounces (oz)', category: 'Weight/Mass Units' },
  { value: 'cwt', label: 'Hundredweight (cwt)', category: 'Weight/Mass Units' },

  // Packaging Units
  { value: 'bags', label: 'Bags', category: 'Packaging Units' },
  { value: 'boxes', label: 'Boxes', category: 'Packaging Units' },
  { value: 'cartons', label: 'Cartons', category: 'Packaging Units' },
  { value: 'cans', label: 'Cans', category: 'Packaging Units' },
  { value: 'drums', label: 'Drums', category: 'Packaging Units' },
  { value: 'barrels', label: 'Barrels', category: 'Packaging Units' },
  { value: 'bottles', label: 'Bottles', category: 'Packaging Units' },
  { value: 'buckets', label: 'Buckets', category: 'Packaging Units' },
  { value: 'bundles', label: 'Bundles', category: 'Packaging Units' },
  { value: 'coils', label: 'Coils', category: 'Packaging Units' },
  { value: 'crates', label: 'Crates', category: 'Packaging Units' },
  { value: 'pallets', label: 'Pallets', category: 'Packaging Units' },
  { value: 'packs', label: 'Packs', category: 'Packaging Units' },
  { value: 'rolls', label: 'Rolls', category: 'Packaging Units' },
  { value: 'sheets', label: 'Sheets', category: 'Packaging Units' },
  { value: 'tubes', label: 'Tubes', category: 'Packaging Units' },

  // Construction Specific
  { value: 'panels', label: 'Panels', category: 'Construction Specific' },
  { value: 'blocks', label: 'Blocks', category: 'Construction Specific' },
  { value: 'bricks', label: 'Bricks', category: 'Construction Specific' },
  { value: 'tiles', label: 'Tiles', category: 'Construction Specific' },
  { value: 'boards', label: 'Boards', category: 'Construction Specific' },
  { value: 'slabs', label: 'Slabs', category: 'Construction Specific' },
  { value: 'bars', label: 'Bars', category: 'Construction Specific' },
  { value: 'rods', label: 'Rods', category: 'Construction Specific' },
  { value: 'lengths', label: 'Lengths', category: 'Construction Specific' },
  { value: 'strips', label: 'Strips', category: 'Construction Specific' },
];

const StockInPage: React.FC = () => {
  // Data states
  const [allMaterials, setAllMaterials] = useState<InventoryMaterial[]>([]);
  const [purchaseTransactions, setPurchaseTransactions] = useState<PurchaseTransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<PurchaseTransaction[]>([]);

  // UI states
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedMaterials, setExpandedMaterials] = useState<Set<number>>(new Set());

  // Last transport details for "Copy from Last Entry" feature
  const [lastTransportDetails, setLastTransportDetails] = useState<{
    driver_name: string;
    vehicle_number: string;
    transport_fee: number;
    transport_notes: string;
    delivery_batch_ref: string;
    delivery_note_url?: string;
  } | null>(null);

  // Delivery batch selection
  const [showBatchListModal, setShowBatchListModal] = useState(false);
  const [recentBatches, setRecentBatches] = useState<Array<{
    delivery_batch_ref: string;
    driver_name: string;
    vehicle_number: string;
    transport_fee: number;
    transport_notes: string;
    created_at: string;
    material_count: number;
    delivery_note_url?: string;
  }>>([]);

  // Reference info from selected batch (for display only, not saved)
  const [selectedBatchReference, setSelectedBatchReference] = useState<{
    original_fee: number;
    delivery_note_url?: string;
  } | null>(null);

  // Purchase form data
  const [purchaseFormData, setPurchaseFormData] = useState<PurchaseTransaction>({
    inventory_material_id: 0,
    transaction_type: 'PURCHASE',
    quantity: 0,
    unit_price: 0,
    total_amount: 0,
    reference_number: '',
    notes: '',
    // Transport fields
    driver_name: '',
    vehicle_number: '',
    transport_fee: 0,
    transport_notes: '',
    delivery_batch_ref: ''
  });
  const [deliveryNoteFile, setDeliveryNoteFile] = useState<File | null>(null);

  // Selected material for display
  const [selectedMaterial, setSelectedMaterial] = useState<InventoryMaterial | null>(null);

  // Material search combobox state
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const materialDropdownRef = useRef<HTMLDivElement>(null);
  const unitDropdownRef = useRef<HTMLDivElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);

  // New material modal state
  const [showNewMaterialModal, setShowNewMaterialModal] = useState(false);
  const [newMaterialData, setNewMaterialData] = useState({
    material_name: '',
    brand: '',
    size: '',
    category: '',
    unit: 'pcs',
    unit_price: 0,
    current_stock: 0,
    min_stock_level: 0,
    description: ''
  });
  const [savingNewMaterial, setSavingNewMaterial] = useState(false);

  // Custom units states
  const [customUnits, setCustomUnits] = useState<CustomUnit[]>([]);
  const [unitSearchTerm, setUnitSearchTerm] = useState('');
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [newUnitData, setNewUnitData] = useState({ value: '', label: '' });

  // Confirmation modal
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Confirm'
  });

  // Buyer Transfers state
  const [showBuyerTransfersModal, setShowBuyerTransfersModal] = useState(false);
  const [buyerTransfers, setBuyerTransfers] = useState<BuyerTransfer[]>([]);
  const [loadingBuyerTransfers, setLoadingBuyerTransfers] = useState(false);
  const [receivingTransferId, setReceivingTransferId] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterTransactions();
    extractRecentBatches(); // Extract delivery batches when transactions change
  }, [searchTerm, purchaseTransactions]);

  // Filter materials based on search term using useMemo for better performance
  const filteredMaterials = useMemo(() => {
    if (materialSearchTerm.trim() === '') {
      return allMaterials;
    }
    const search = materialSearchTerm.toLowerCase();
    return allMaterials.filter(m =>
      m.material_name?.toLowerCase().includes(search) ||
      m.material_code?.toLowerCase().includes(search) ||
      m.brand?.toLowerCase().includes(search)
    );
  }, [materialSearchTerm, allMaterials]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!showMaterialDropdown && !showUnitDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      // Check material dropdown
      if (showMaterialDropdown && materialDropdownRef.current && !materialDropdownRef.current.contains(event.target as Node)) {
        setShowMaterialDropdown(false);
      }
      // Check unit dropdown
      if (showUnitDropdown && unitDropdownRef.current && !unitDropdownRef.current.contains(event.target as Node)) {
        setShowUnitDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMaterialDropdown, showUnitDropdown]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch materials and transactions (required)
      const [materials, transactionsResult] = await Promise.all([
        inventoryService.getAllInventoryItems(),
        inventoryService.getAllInventoryTransactions({ transaction_type: 'PURCHASE' })
      ]);

      setAllMaterials(materials);
      setPurchaseTransactions(transactionsResult.transactions);

      // Fetch custom units (optional - fail gracefully if not accessible)
      try {
        const customUnitsData = await inventoryService.getCustomUnits();
        setCustomUnits(customUnitsData);
      } catch (error) {
        console.warn('Custom units not available:', error);
        setCustomUnits([]); // Continue with empty custom units
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterTransactions = () => {
    let filtered = [...purchaseTransactions];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(txn =>
        txn.material_name?.toLowerCase().includes(search) ||
        txn.material_code?.toLowerCase().includes(search) ||
        txn.reference_number?.toLowerCase().includes(search)
      );
    }

    setFilteredTransactions(filtered);
  };

  // Fetch pending buyer transfers
  const fetchBuyerTransfers = async () => {
    setLoadingBuyerTransfers(true);
    try {
      const response = await apiClient.get('/inventory/buyer-transfers/pending', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      if (response.data.success) {
        setBuyerTransfers(response.data.transfers || []);
      }
    } catch (error) {
      console.error('Error fetching buyer transfers:', error);
      setBuyerTransfers([]);
    } finally {
      setLoadingBuyerTransfers(false);
    }
  };

  // Receive a buyer transfer
  const handleReceiveBuyerTransfer = async (deliveryNoteId: number) => {
    setReceivingTransferId(deliveryNoteId);
    try {
      const response = await apiClient.post(`/inventory/buyer-transfers/${deliveryNoteId}/receive`, {}, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      if (response.data.success) {
        alert(`Transfer ${response.data.delivery_note_number} received successfully! Materials added to inventory.`);
        // Refresh both buyer transfers and main data
        fetchBuyerTransfers();
        fetchData();
      }
    } catch (error: any) {
      console.error('Error receiving transfer:', error);
      alert(error.response?.data?.error || 'Failed to receive transfer');
    } finally {
      setReceivingTransferId(null);
    }
  };

  // Download buyer transfer DN as PDF
  const handleDownloadBuyerTransferPDF = async (deliveryNoteId: number, deliveryNoteNumber: string) => {
    try {
      const response = await apiClient.get(`/inventory/delivery_note/${deliveryNoteId}/download`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        responseType: 'blob'
      });

      // Create download link
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${deliveryNoteNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      alert(error.response?.data?.error || 'Failed to download PDF');
    }
  };

  // Open buyer transfers modal
  const handleOpenBuyerTransfersModal = () => {
    setShowBuyerTransfersModal(true);
    fetchBuyerTransfers();
  };

  // Extract recent delivery batches from transactions
  const extractRecentBatches = () => {
    const batchMap = new Map<string, {
      delivery_batch_ref: string;
      driver_name: string;
      vehicle_number: string;
      transport_fee: number;
      transport_notes: string;
      created_at: string;
      material_count: number;
      delivery_note_url?: string;
    }>();

    // Group transactions by delivery_batch_ref
    purchaseTransactions.forEach(txn => {
      if (txn.delivery_batch_ref) {
        if (!batchMap.has(txn.delivery_batch_ref)) {
          batchMap.set(txn.delivery_batch_ref, {
            delivery_batch_ref: txn.delivery_batch_ref,
            driver_name: txn.driver_name || '',
            vehicle_number: txn.vehicle_number || '',
            transport_fee: txn.transport_fee || 0,
            transport_notes: txn.transport_notes || '',
            created_at: txn.created_at || '',
            material_count: 1,
            delivery_note_url: txn.delivery_note_url // Keep the first delivery note
          });
        } else {
          const existing = batchMap.get(txn.delivery_batch_ref)!;
          existing.material_count += 1;
          // Keep the MAXIMUM transport fee (the one that was actually paid)
          if (txn.transport_fee && txn.transport_fee > existing.transport_fee) {
            existing.transport_fee = txn.transport_fee;
          }
          // Keep delivery note URL if current one is empty but transaction has one
          if (!existing.delivery_note_url && txn.delivery_note_url) {
            existing.delivery_note_url = txn.delivery_note_url;
          }
        }
      }
    });

    // Convert to array and sort by date (most recent first)
    const batches = Array.from(batchMap.values()).sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setRecentBatches(batches.slice(0, 10)); // Keep only 10 most recent batches
  };

  // Group transactions by material
  const groupedTransactions = useMemo(() => {
    const groups = new Map<number, {
      material: {
        id: number;
        code: string;
        name: string;
        brand?: string;
        unit: string;
      };
      transactions: PurchaseTransaction[];
      totalQuantity: number;
      totalAmount: number;
    }>();

    filteredTransactions.forEach(txn => {
      const materialId = txn.inventory_material_id!;
      if (!groups.has(materialId)) {
        groups.set(materialId, {
          material: {
            id: materialId,
            code: txn.material_code || '',
            name: txn.material_name || '',
            brand: txn.brand,
            unit: txn.unit || ''
          },
          transactions: [],
          totalQuantity: 0,
          totalAmount: 0
        });
      }
      const group = groups.get(materialId)!;
      group.transactions.push(txn);
      group.totalQuantity += txn.quantity;
      group.totalAmount += txn.total_amount;
    });

    return Array.from(groups.values()).sort((a, b) => {
      // Sort by most recent transaction date
      const aLatest = Math.max(...a.transactions.map(t => new Date(t.created_at || '').getTime()));
      const bLatest = Math.max(...b.transactions.map(t => new Date(t.created_at || '').getTime()));
      return bLatest - aLatest;
    });
  }, [filteredTransactions]);

  const toggleMaterialExpansion = (materialId: number) => {
    setExpandedMaterials(prev => {
      const newSet = new Set(prev);
      if (newSet.has(materialId)) {
        newSet.delete(materialId);
      } else {
        newSet.add(materialId);
      }
      return newSet;
    });
  };

  const handleOpenPurchaseModal = () => {
    setPurchaseFormData({
      inventory_material_id: 0,
      transaction_type: 'PURCHASE',
      quantity: 0,
      unit_price: 0,
      total_amount: 0,
      reference_number: '',
      notes: '',
      // Reset transport fields
      driver_name: '',
      vehicle_number: '',
      transport_fee: 0,
      transport_notes: '',
      delivery_batch_ref: ''
    });
    setSelectedMaterial(null);
    setMaterialSearchTerm('');
    setShowMaterialDropdown(false);
    setShowNewMaterialModal(false); // Ensure Add Material modal is closed
    setDeliveryNoteFile(null); // Clear any previously uploaded file
    setSelectedBatchReference(null); // Clear batch reference info
    setShowPurchaseModal(true);
  };

  const handleMaterialSearchChange = (value: string) => {
    setMaterialSearchTerm(value);
    setShowMaterialDropdown(true);
    // Clear selection if user is typing
    if (selectedMaterial && value !== `${selectedMaterial.material_code} - ${selectedMaterial.material_name}`) {
      setSelectedMaterial(null);
      setPurchaseFormData(prev => ({
        ...prev,
        inventory_material_id: 0,
        unit_price: 0
      }));
    }
  };

  const handleSelectMaterialFromDropdown = (material: InventoryMaterial) => {
    setSelectedMaterial(material);
    setMaterialSearchTerm(`${material.material_code} - ${material.material_name}${material.brand ? ` (${material.brand})` : ''}`);
    setPurchaseFormData(prev => ({
      ...prev,
      inventory_material_id: material.inventory_material_id || 0,
      unit_price: material.unit_price || 0
    }));
    setShowMaterialDropdown(false);

    // Also ensure the input doesn't refocus and reopen dropdown
    if (materialInputRef.current) {
      materialInputRef.current.blur();
    }
  };

  // Combined units list (predefined + custom from DB)
  const allUnits = useMemo(() => {
    const combined = [
      ...PREDEFINED_UNITS.map(u => ({ value: u.value, label: u.label, category: u.category, isCustom: false })),
      ...customUnits.map(u => ({ value: u.value, label: u.label, category: 'Custom Units', isCustom: true }))
    ];
    return combined;
  }, [customUnits]);

  // Filtered units based on search term
  const filteredUnits = useMemo(() => {
    if (!unitSearchTerm.trim()) return allUnits;
    const search = unitSearchTerm.toLowerCase();
    return allUnits.filter(unit =>
      unit.value.toLowerCase().includes(search) ||
      unit.label.toLowerCase().includes(search)
    );
  }, [allUnits, unitSearchTerm]);

  const handleUnitSearchChange = (value: string) => {
    setUnitSearchTerm(value);
    setNewMaterialData(prev => ({ ...prev, unit: value }));
    setShowUnitDropdown(true);
  };

  const handleSelectUnit = (unitValue: string) => {
    const selectedUnit = allUnits.find(u => u.value === unitValue);
    setNewMaterialData(prev => ({ ...prev, unit: unitValue }));
    setUnitSearchTerm(selectedUnit?.label || unitValue);
    setShowUnitDropdown(false);
  };

  const handleCreateCustomUnit = async () => {
    if (!newUnitData.value.trim() || !newUnitData.label.trim()) {
      alert('Please enter both unit value and label');
      return;
    }

    try {
      const createdUnit = await inventoryService.createCustomUnit(
        newUnitData.value.trim(),
        newUnitData.label.trim()
      );

      // Add to custom units list
      setCustomUnits(prev => [createdUnit, ...prev]);

      // Auto-select the newly created unit
      handleSelectUnit(createdUnit.value);

      // Reset and close modal
      setNewUnitData({ value: '', label: '' });
      setShowAddUnitModal(false);
      alert('Custom unit created successfully!');
    } catch (error: any) {
      console.error('Error creating custom unit:', error);
      alert(error.message || 'Failed to create custom unit');
    }
  };

  const handleClearMaterialSelection = () => {
    setSelectedMaterial(null);
    setMaterialSearchTerm('');
    setPurchaseFormData(prev => ({
      ...prev,
      inventory_material_id: 0,
      unit_price: 0
    }));
    materialInputRef.current?.focus();
  };

  const handleOpenNewMaterialModal = () => {
    setNewMaterialData({
      material_name: materialSearchTerm, // Pre-fill with search term
      brand: '',
      size: '',
      category: '',
      unit: 'pcs',
      unit_price: 0,
      current_stock: 0,
      min_stock_level: 0,
      description: ''
    });
    setUnitSearchTerm('Pieces (pcs)'); // Initialize unit search with default
    setShowNewMaterialModal(true);
    setShowMaterialDropdown(false);
  };

  const handleSaveNewMaterial = async () => {
    if (!newMaterialData.material_name.trim()) {
      alert('Please enter a material name');
      return;
    }
    if (!newMaterialData.unit.trim()) {
      alert('Please enter a unit');
      return;
    }
    // Validate numeric fields
    if (newMaterialData.unit_price < 0 || isNaN(newMaterialData.unit_price)) {
      alert('Unit price must be a valid positive number');
      return;
    }
    if (newMaterialData.min_stock_level < 0 || isNaN(newMaterialData.min_stock_level)) {
      alert('Min stock level must be a valid positive number');
      return;
    }

    setSavingNewMaterial(true);
    try {
      // Check if the unit exists in predefined or custom units
      const unitExists = allUnits.some(u => u.value.toLowerCase() === newMaterialData.unit.toLowerCase());

      // If unit doesn't exist, create it first
      if (!unitExists) {
        try {
          const createdUnit = await inventoryService.createCustomUnit(
            newMaterialData.unit.toLowerCase().trim(),
            unitSearchTerm || newMaterialData.unit // Use the display name from search term or the value itself
          );
          // Add to custom units list
          setCustomUnits(prev => [createdUnit, ...prev]);
        } catch (error) {
          console.warn('Failed to create custom unit, continuing with material creation:', error);
          // Continue even if custom unit creation fails - the material can still use the unit value
        }
      }

      // Create the material (stock starts at 0, will be added via Stock In)
      const createdMaterial = await inventoryService.createInventoryItem({
        material_name: newMaterialData.material_name,
        brand: newMaterialData.brand || undefined,
        size: newMaterialData.size || undefined,
        category: newMaterialData.category || undefined,
        unit: newMaterialData.unit,
        unit_price: newMaterialData.unit_price,
        current_stock: 0,
        min_stock_level: newMaterialData.min_stock_level || undefined,
        description: newMaterialData.description || undefined
      });

      // Add to materials list
      setAllMaterials(prev => [createdMaterial, ...prev]);

      // Auto-select the newly created material in the Stock In form
      handleSelectMaterialFromDropdown(createdMaterial);

      // Reset the new material form
      setNewMaterialData({
        material_name: '',
        brand: '',
        size: '',
        category: '',
        unit: 'pcs',
        unit_price: 0,
        current_stock: 0,
        min_stock_level: 0,
        description: ''
      });
      setUnitSearchTerm('Pieces (pcs)');

      setShowNewMaterialModal(false);
      alert('Material created successfully! You can now enter the quantity and price.');
    } catch (error: any) {
      console.error('Error creating material:', error);
      // Show specific error message from backend (e.g., duplicate detection)
      const errorMessage = error.response?.data?.error || error.message || 'Failed to create material. Please try again.';
      alert(errorMessage);
    } finally {
      setSavingNewMaterial(false);
    }
  };

  const handleQuantityChange = (quantity: number) => {
    const total = quantity * purchaseFormData.unit_price;
    setPurchaseFormData({
      ...purchaseFormData,
      quantity,
      total_amount: total
    });
  };

  const handleUnitPriceChange = (unitPrice: number) => {
    const total = purchaseFormData.quantity * unitPrice;
    setPurchaseFormData({
      ...purchaseFormData,
      unit_price: unitPrice,
      total_amount: total
    });
  };

  const handleSavePurchase = async () => {
    try {
      // Validation
      if (!purchaseFormData.inventory_material_id) {
        alert('Please select a material');
        return;
      }
      if (purchaseFormData.quantity <= 0) {
        alert('Please enter a valid quantity');
        return;
      }
      if (purchaseFormData.unit_price <= 0) {
        alert('Please enter a valid unit price');
        return;
      }
      // Check if delivery note is provided (either new file OR existing URL from batch)
      if (!deliveryNoteFile && !selectedBatchReference?.delivery_note_url) {
        alert('Please upload a delivery note from vendor');
        return;
      }

      // Auto-generate delivery batch reference if transport details provided and no existing batch ref
      let finalBatchRef = purchaseFormData.delivery_batch_ref;

      // Check if user made changes that require a new batch ref (different delivery)
      const hasTransportFeeChange = selectedBatchReference &&
        purchaseFormData.transport_fee !== 0 &&
        purchaseFormData.transport_fee !== selectedBatchReference.original_fee;

      const hasNewDeliveryNote = deliveryNoteFile !== null && selectedBatchReference?.delivery_note_url;

      // If user changed transport fee or uploaded new delivery note, this is a different delivery - create new batch
      if (finalBatchRef && (hasTransportFeeChange || hasNewDeliveryNote)) {
        finalBatchRef = ''; // Clear batch ref to force generation of new one
      }

      if (!finalBatchRef && (purchaseFormData.driver_name || purchaseFormData.vehicle_number)) {
        // First material in a new delivery - generate new batch ref like MSQ-IN-01
        // Count existing transactions to get next sequence number
        const existingBatchRefs = purchaseTransactions
          .map(txn => txn.delivery_batch_ref)
          .filter(ref => ref && ref.startsWith('MSQ-IN-'));

        const sequenceNumbers = existingBatchRefs.map(ref => {
          const match = ref.match(/MSQ-IN-(\d+)/);
          return match ? parseInt(match[1]) : 0;
        });

        const nextSequence = sequenceNumbers.length > 0
          ? Math.max(...sequenceNumbers) + 1
          : 1;

        finalBatchRef = `MSQ-IN-${String(nextSequence).padStart(2, '0')}`;
      }

      const transactionToSave = {
        ...purchaseFormData,
        delivery_batch_ref: finalBatchRef,
        // Use existing delivery note URL if no new file uploaded
        delivery_note_url: !deliveryNoteFile && selectedBatchReference?.delivery_note_url
          ? selectedBatchReference.delivery_note_url
          : undefined
      };

      setConfirmModal({
        show: true,
        title: 'Confirm Stock In',
        message: `Are you sure you want to receive ${purchaseFormData.quantity} ${selectedMaterial?.unit} of ${selectedMaterial?.material_name}? This will add stock to inventory.`,
        onConfirm: async () => {
          setSaving(true);
          try {
            // Use createTransactionWithFile to handle file upload or existing URL
            const result = await inventoryService.createTransactionWithFile(transactionToSave, deliveryNoteFile);

            // Save transport details INCLUDING batch ref and delivery note URL for quick reuse
            if (purchaseFormData.driver_name || purchaseFormData.vehicle_number || purchaseFormData.transport_fee) {
              setLastTransportDetails({
                driver_name: purchaseFormData.driver_name || '',
                vehicle_number: purchaseFormData.vehicle_number || '',
                transport_fee: purchaseFormData.transport_fee || 0,
                transport_notes: purchaseFormData.transport_notes || '',
                delivery_batch_ref: finalBatchRef || '',
                delivery_note_url: result.delivery_note_url || transactionToSave.delivery_note_url
              });
            }

            alert('Stock In recorded successfully!');
            setShowPurchaseModal(false);
            setDeliveryNoteFile(null); // Clear uploaded file
            await fetchData();
          } catch (error) {
            console.error('Error creating purchase transaction:', error);
            alert('Failed to record Stock In. Please try again.');
          } finally {
            setSaving(false);
            setConfirmModal({ ...confirmModal, show: false });
          }
        },
        confirmText: 'Confirm'
      });
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return `AED ${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <ModernLoadingSpinners size="md" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <ArrowDownCircle className="w-8 h-8 text-green-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock In</h1>
            <p className="text-sm text-gray-500">Record material receipts from vendors</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {/* Buyer Transfers Button */}
          <button
            onClick={handleOpenBuyerTransfersModal}
            className="relative flex items-center space-x-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
          >
            <Truck className="w-5 h-5" />
            <span>Buyer Transfers</span>
          </button>
          <button
            onClick={handleOpenPurchaseModal}
            className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            <ArrowDownCircle className="w-5 h-5" />
            <span>Record Stock In</span>
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by material name, code, or reference number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Purchase Transactions - Grouped by Material */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {groupedTransactions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">No stock in transactions found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {groupedTransactions.map((group) => {
              const isExpanded = expandedMaterials.has(group.material.id);
              const transactionCount = group.transactions.length;

              return (
                <div key={group.material.id} className="hover:bg-gray-50">
                  {/* Material Header Row - Clickable - Full Width Layout */}
                  <div
                    onClick={() => toggleMaterialExpansion(group.material.id)}
                    className="px-6 py-4 cursor-pointer select-none"
                  >
                    <div className="grid grid-cols-12 gap-4 items-center">
                      {/* Left: Expand Icon + Material Info (6 cols) */}
                      <div className="col-span-6 flex items-center space-x-3">
                        <ChevronDown
                          className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{group.material.name}</span>
                            {group.material.brand && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{group.material.brand}</span>
                            )}
                          </div>
                          <div className="mt-0.5">
                            <span className="text-xs font-mono text-gray-500">{group.material.code}</span>
                          </div>
                        </div>
                      </div>

                      {/* Center: Transaction Count (2 cols) */}
                      <div className="col-span-2 text-center">
                        <div className="inline-flex items-center space-x-1 bg-blue-50 px-3 py-1 rounded-full">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          <span className="text-sm font-medium text-blue-700">{transactionCount}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {transactionCount === 1 ? 'transaction' : 'transactions'}
                        </div>
                      </div>

                      {/* Right-Center: Total Quantity (2 cols) */}
                      <div className="col-span-2 text-center">
                        <div className="text-sm font-semibold text-gray-900">
                          {group.totalQuantity.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {group.material.unit}
                        </div>
                      </div>

                      {/* Right: Total Amount (2 cols) */}
                      <div className="col-span-2 text-right">
                        <div className="text-sm font-bold text-green-600">
                          {formatCurrency(group.totalAmount)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Total Value
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Transaction Details */}
                  {isExpanded && (
                    <div className="bg-gray-50 border-t border-gray-200">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Delivery Note</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Transport Fee</th>
                              <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-100">
                            {group.transactions.map((txn) => (
                              <tr key={txn.inventory_transaction_id} className="hover:bg-gray-50">
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {formatDate(txn.created_at)}
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {txn.quantity} {txn.unit}
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {formatCurrency(txn.unit_price)}
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {formatCurrency(txn.total_amount)}
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {txn.reference_number || '-'}
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm">
                                  {txn.delivery_note_url ? (
                                    <a
                                      href={txn.delivery_note_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 hover:underline"
                                      title="View/Download Delivery Note"
                                    >
                                      <FileText className="w-4 h-4" />
                                      <span>View</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {txn.driver_name || '-'}
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">
                                  {txn.vehicle_number || '-'}
                                </td>
                                <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                                  {txn.transport_fee ? formatCurrency(txn.transport_fee) : '-'}
                                </td>
                                <td className="px-6 py-3 text-sm text-gray-600 max-w-xs">
                                  <div className="space-y-1">
                                    {txn.notes && (
                                      <div className="truncate" title={txn.notes}>
                                        <span className="font-medium text-gray-700">Notes:</span> {txn.notes}
                                      </div>
                                    )}
                                    {txn.transport_notes && (
                                      <div className="truncate text-blue-600" title={txn.transport_notes}>
                                        <span className="font-medium">Delivery:</span> {txn.transport_notes}
                                      </div>
                                    )}
                                    {!txn.notes && !txn.transport_notes && '-'}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <div className="flex items-center space-x-3">
                <ArrowDownCircle className="w-6 h-6 text-green-600" />
                <h2 className="text-xl font-bold text-gray-900">New Stock In</h2>
              </div>
              <button
                onClick={() => setShowPurchaseModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Material Selection - Searchable Combobox */}
              <div ref={materialDropdownRef} className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Package className="w-4 h-4 inline mr-1" />
                  Material *
                </label>
                <div className="relative">
                  <input
                    ref={materialInputRef}
                    type="text"
                    value={materialSearchTerm}
                    onChange={(e) => handleMaterialSearchChange(e.target.value)}
                    onFocus={() => {
                      // Only show dropdown if no material is selected
                      if (!selectedMaterial) {
                        setShowMaterialDropdown(true);
                      }
                    }}
                    onClick={(e) => {
                      // If material is selected, prevent editing
                      if (selectedMaterial) {
                        e.currentTarget.blur();
                      }
                    }}
                    placeholder="Search material..."
                    className={`w-full px-4 py-2 pr-20 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                      selectedMaterial ? 'bg-gray-50 cursor-not-allowed' : ''
                    }`}
                    readOnly={selectedMaterial !== null}
                    disabled={selectedMaterial !== null}
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                    {selectedMaterial && (
                      <button
                        type="button"
                        onClick={handleClearMaterialSelection}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Clear selection"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {!selectedMaterial && (
                      <button
                        type="button"
                        onClick={() => setShowMaterialDropdown(!showMaterialDropdown)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Toggle dropdown"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${showMaterialDropdown ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Dropdown List */}
                {showMaterialDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {/* Show existing materials */}
                    {filteredMaterials.length === 0 && materialSearchTerm.trim() === '' ? (
                      <div className="px-4 py-3 text-gray-500 text-sm">
                        Type to search materials...
                      </div>
                    ) : (
                      <>
                        {filteredMaterials.map((material) => (
                          <button
                            key={material.inventory_material_id}
                            type="button"
                            onClick={() => handleSelectMaterialFromDropdown(material)}
                            className={`w-full px-4 py-2 text-left hover:bg-gray-100 flex flex-col ${
                              selectedMaterial?.inventory_material_id === material.inventory_material_id ? 'bg-green-50' : ''
                            }`}
                          >
                          <span className="font-medium text-gray-900">
                            {material.material_code} - {material.material_name}
                          </span>
                          {material.brand && (
                            <span className="text-sm text-gray-500">{material.brand}</span>
                          )}
                        </button>
                      ))}

                      {/* Show "Create New Material" option when user types something */}
                      {materialSearchTerm.trim() !== '' && (
                        <button
                          type="button"
                          onClick={handleOpenNewMaterialModal}
                          className="w-full px-4 py-3 text-left hover:bg-green-50 border-t border-gray-200 flex items-center space-x-2 text-green-600 font-medium"
                        >
                          <Plus className="w-4 h-4" />
                          <span>+ Create New Material: "{materialSearchTerm}"</span>
                        </button>
                      )}
                    </>
                    )}
                  </div>
                )}
              </div>

              {selectedMaterial && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Material Code:</span>
                      <span className="ml-2 font-medium">{selectedMaterial.material_code}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Current Stock:</span>
                      <span className="ml-2 font-medium">{selectedMaterial.current_stock} {selectedMaterial.unit}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Reference Price:</span>
                      <span className="ml-2 font-medium">
                        {selectedMaterial.unit_price && selectedMaterial.unit_price > 0
                          ? `AED ${selectedMaterial.unit_price.toFixed(2)}`
                          : 'Not set yet (first purchase)'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity Received *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseFormData.quantity || ''}
                  onChange={(e) => handleQuantityChange(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter quantity received"
                  required
                />
                {selectedMaterial && (
                  <p className="text-xs text-gray-500 mt-1">
                    Unit: {selectedMaterial.unit}
                  </p>
                )}
              </div>

              {/* Unit Price - Actual Purchase Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  Actual Purchase Price (AED) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseFormData.unit_price || ''}
                  onChange={(e) => handleUnitPriceChange(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter actual purchase price per unit"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the actual price paid to vendor for this purchase
                </p>
              </div>

              {/* Total Amount (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Amount (AED)
                </label>
                <input
                  type="text"
                  value={formatCurrency(purchaseFormData.total_amount)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 cursor-not-allowed"
                  readOnly
                  disabled
                />
              </div>

              {/* Reference Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4 inline mr-1" />
                  Reference Number (PO/Invoice)
                </label>
                <input
                  type="text"
                  value={purchaseFormData.reference_number || ''}
                  onChange={(e) => setPurchaseFormData({ ...purchaseFormData, reference_number: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter PO or Invoice number"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={purchaseFormData.notes || ''}
                  onChange={(e) => setPurchaseFormData({ ...purchaseFormData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Add any additional notes..."
                />
              </div>

              {/* Transport & Delivery Details */}
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                    <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                    </svg>
                    Transport & Delivery Details
                  </h3>
                  {recentBatches.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowBatchListModal(true)}
                      className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm flex items-center space-x-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                      </svg>
                      <span>Recent Deliveries</span>
                    </button>
                  )}
                </div>

                {recentBatches.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-blue-800">
                        <strong>Last Delivery:</strong> {recentBatches[0].driver_name} • {recentBatches[0].vehicle_number}
                        {recentBatches[0].delivery_batch_ref && (
                          <span className="ml-2 px-2 py-0.5 bg-blue-100 rounded text-xs font-mono">
                            {recentBatches[0].delivery_batch_ref}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          // Use the most recent batch from recentBatches instead of lastTransportDetails
                          // This ensures we always have the delivery_note_url from the database
                          const mostRecentBatch = recentBatches[0];
                          if (mostRecentBatch) {
                            console.log('Last Delivery clicked. Using most recent batch:', mostRecentBatch);
                            console.log('Delivery note URL:', mostRecentBatch.delivery_note_url);

                            setSelectedBatchReference({
                              original_fee: mostRecentBatch.transport_fee || 0,
                              delivery_note_url: mostRecentBatch.delivery_note_url
                            });

                            setPurchaseFormData(prev => ({
                              ...prev,
                              driver_name: mostRecentBatch.driver_name,
                              vehicle_number: mostRecentBatch.vehicle_number,
                              transport_fee: 0,  // Set to 0 for same batch (fee was already paid on first material)
                              transport_notes: mostRecentBatch.transport_notes,
                              delivery_batch_ref: mostRecentBatch.delivery_batch_ref
                            }));
                          }
                        }}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center space-x-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Last Delivery</span>
                      </button>
                    </div>
                    <p className="text-xs text-blue-600 mt-2">
                      Materials from the same delivery will share the batch reference and transport details. Only the first material should have the transport fee.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {/* Driver Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Driver Name
                    </label>
                    <input
                      type="text"
                      value={purchaseFormData.driver_name || ''}
                      onChange={(e) => setPurchaseFormData({ ...purchaseFormData, driver_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Enter driver name"
                    />
                  </div>

                  {/* Vehicle Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Vehicle Number
                    </label>
                    <input
                      type="text"
                      value={purchaseFormData.vehicle_number || ''}
                      onChange={(e) => setPurchaseFormData({ ...purchaseFormData, vehicle_number: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Enter vehicle number"
                    />
                  </div>
                </div>

                {/* Transport Fee */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transport Fee (AED)
                  </label>

                  {/* Show reference info if batch was selected */}
                  {selectedBatchReference && selectedBatchReference.original_fee > 0 && (
                    <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-amber-800 font-medium text-sm">
                        Reference: Original transport fee for this batch was: <span className="font-bold">AED {selectedBatchReference.original_fee.toFixed(2)}</span>
                      </p>
                      <p className="text-amber-700 text-xs mt-2">
                        You can edit the fee below if there was an additional charge for this specific material.
                      </p>
                    </div>
                  )}

                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={purchaseFormData.transport_fee || ''}
                    onChange={(e) => setPurchaseFormData({ ...purchaseFormData, transport_fee: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Enter transport fee for this delivery"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the transport fee paid for delivering these materials from vendor to store
                  </p>
                </div>
              </div>

              {/* Delivery Note Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4 inline mr-1" />
                  Delivery Note from Vendor <span className="text-red-500">*</span>
                </label>

                {/* Show reference to original batch delivery note - allow using it */}
                {selectedBatchReference && !deliveryNoteFile ? (
                  selectedBatchReference.delivery_note_url ? (
                    <div className="mb-3 bg-green-50 border-2 border-green-300 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <CheckCircle className="w-6 h-6 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-green-800 font-semibold mb-2 text-sm">
                            ✓ Delivery Note Available from Batch
                          </p>
                          <a
                            href={selectedBatchReference.delivery_note_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800 underline font-medium mb-3"
                          >
                            <FileText className="w-4 h-4" />
                            <span>View Batch Delivery Note</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <p className="text-green-700 text-xs leading-relaxed">
                            This material will use the delivery note from the selected batch. You can upload a different file below if this specific material has a separate delivery note.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3 bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-orange-800 font-semibold mb-2 text-sm">
                            ⚠ No Delivery Note in Selected Batch
                          </p>
                          <p className="text-orange-700 text-xs leading-relaxed mb-2">
                            The first material from this batch ({purchaseFormData.delivery_batch_ref}) was received without uploading a delivery note. You must upload a delivery note for this material.
                          </p>
                          <p className="text-orange-600 text-xs font-medium">
                            Please upload the delivery note below before proceeding.
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                ) : null}

                {/* File input */}
                <div>
                  <div className="relative">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          // Check file size (max 10MB)
                          if (file.size > 10 * 1024 * 1024) {
                            alert('File size must be less than 10MB');
                            e.target.value = '';
                            return;
                          }
                          setDeliveryNoteFile(file);
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedBatchReference && selectedBatchReference.delivery_note_url
                      ? '(Optional) Upload a new file only if this material has a different delivery note'
                      : 'Upload delivery note, invoice, or receipt (PDF, JPG, PNG, DOC - Max 10MB)'}
                  </p>
                </div>

                {deliveryNoteFile && (
                  <div className="mt-2 flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-green-700 font-medium">{deliveryNoteFile.name}</span>
                      <span className="text-xs text-green-600">({(deliveryNoteFile.size / 1024).toFixed(2)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeliveryNoteFile(null)}
                      className="text-red-500 hover:text-red-700"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowPurchaseModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePurchase}
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <ModernLoadingSpinners size="xxs" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>Confirm Stock In</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Material Modal */}
      {showNewMaterialModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <div className="flex items-center space-x-3">
                <Plus className="w-6 h-6 text-green-600" />
                <h2 className="text-xl font-bold text-gray-900">Add New Material</h2>
              </div>
              <button
                onClick={() => setShowNewMaterialModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Material Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Material Name *
                </label>
                <input
                  type="text"
                  value={newMaterialData.material_name}
                  onChange={(e) => setNewMaterialData({ ...newMaterialData, material_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter material name"
                  autoFocus
                />
              </div>

              {/* Brand */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Brand
                </label>
                <input
                  type="text"
                  value={newMaterialData.brand}
                  onChange={(e) => setNewMaterialData({ ...newMaterialData, brand: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter brand (optional)"
                />
              </div>

              {/* Size and Category Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Size
                  </label>
                  <input
                    type="text"
                    value={newMaterialData.size}
                    onChange={(e) => setNewMaterialData({ ...newMaterialData, size: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="e.g., 10mm, 1L"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={newMaterialData.category}
                    onChange={(e) => setNewMaterialData({ ...newMaterialData, category: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="e.g., Electrical, Plumbing"
                  />
                </div>
              </div>

              {/* Unit - Searchable with Custom Units */}
              <div className="relative" ref={unitDropdownRef}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit *
                </label>
                <input
                  type="text"
                  value={unitSearchTerm}
                  onChange={(e) => handleUnitSearchChange(e.target.value)}
                  onFocus={() => setShowUnitDropdown(true)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Search or type unit (e.g., pcs, kg, m)"
                  required
                />

                {/* Unit Dropdown */}
                {showUnitDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {/* Filtered Units */}
                    {filteredUnits.length === 0 ? (
                      <div className="px-4 py-3 text-gray-500 text-sm">
                        No units found. Type to add custom unit (will be created when you save material).
                      </div>
                    ) : (
                      <>
                        {filteredUnits.map((unit) => (
                          <button
                            key={unit.value}
                            type="button"
                            onClick={() => handleSelectUnit(unit.value)}
                            className="w-full px-4 py-2 text-left hover:bg-gray-100 text-sm flex items-center justify-between"
                          >
                            <span>{unit.label}</span>
                            {unit.isCustom && (
                              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">Custom</span>
                            )}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}

                <p className="text-xs text-gray-500 mt-1">
                  Search from {allUnits.length} units or add custom unit. Price will be set on first Stock In.
                </p>
              </div>

              {/* Min Stock Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Stock Level
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newMaterialData.min_stock_level || ''}
                  onChange={(e) => setNewMaterialData({ ...newMaterialData, min_stock_level: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="0"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newMaterialData.description}
                  onChange={(e) => setNewMaterialData({ ...newMaterialData, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Optional description..."
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowNewMaterialModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                disabled={savingNewMaterial}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewMaterial}
                disabled={savingNewMaterial}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {savingNewMaterial ? (
                  <>
                    <ModernLoadingSpinners size="xxs" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>Create Material</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Delivery Batches Modal */}
      {showBatchListModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center">
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Recent Delivery Batches
              </h2>
              <button
                type="button"
                onClick={() => setShowBatchListModal(false)}
                className="text-white hover:bg-purple-800 rounded-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-180px)]">
              <p className="text-sm text-gray-600 mb-4">
                Select a recent delivery to copy transport and driver details to the form. Click on any batch to auto-fill the form.
              </p>

              <div className="space-y-3">
                {recentBatches.map((batch, index) => (
                  <div
                    key={batch.delivery_batch_ref}
                    onClick={() => {
                      // Store reference info for display
                      setSelectedBatchReference({
                        original_fee: batch.transport_fee || 0,
                        delivery_note_url: batch.delivery_note_url
                      });

                      // Populate form with batch details, but fee = 0 (already paid)
                      setPurchaseFormData(prev => ({
                        ...prev,
                        driver_name: batch.driver_name,
                        vehicle_number: batch.vehicle_number,
                        transport_fee: 0, // Set to 0 - fee already paid on first material
                        transport_notes: batch.transport_notes,
                        delivery_batch_ref: batch.delivery_batch_ref
                      }));

                      // Do NOT copy the file - each material needs its own delivery note
                      setDeliveryNoteFile(null);

                      setShowBatchListModal(false);
                    }}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-purple-50 hover:border-purple-300 cursor-pointer transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-mono font-semibold">
                            {batch.delivery_batch_ref}
                          </span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            {batch.material_count} material{batch.material_count > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-gray-600">Driver:</span>
                            <span className="ml-2 font-medium text-gray-900">{batch.driver_name || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Vehicle:</span>
                            <span className="ml-2 font-medium text-gray-900">{batch.vehicle_number || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Transport Fee:</span>
                            <span className="ml-2 font-medium text-gray-900">AED {batch.transport_fee?.toFixed(2) || '0.00'}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Date:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {new Date(batch.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                          </div>
                        </div>
                        {batch.transport_notes && (
                          <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2">
                            <strong>Notes:</strong> {batch.transport_notes}
                          </div>
                        )}
                      </div>
                      <ChevronDown className="w-5 h-5 text-purple-600 transform -rotate-90" />
                    </div>
                  </div>
                ))}
              </div>

              {recentBatches.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No recent delivery batches found</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end border-t">
              <button
                type="button"
                onClick={() => setShowBatchListModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.show && (
        <ConfirmationModal
          show={confirmModal.show}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal({ ...confirmModal, show: false })}
          confirmText={confirmModal.confirmText}
          confirmColor="APPROVE"
        />
      )}

      {/* Buyer Transfers Modal */}
      {showBuyerTransfersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-orange-50">
              <div className="flex items-center space-x-3">
                <Truck className="w-6 h-6 text-orange-600" />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Buyer Transfers</h2>
                  <p className="text-sm text-gray-500">Receive materials sent by buyers to M2 Store</p>
                </div>
              </div>
              <button
                onClick={() => setShowBuyerTransfersModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {loadingBuyerTransfers ? (
                <div className="flex items-center justify-center py-12">
                  <ModernLoadingSpinners size="md" />
                </div>
              ) : buyerTransfers.length === 0 ? (
                <div className="text-center py-12">
                  <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No pending buyer transfers</p>
                  <p className="text-sm text-gray-400 mt-1">All transfers have been received</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {buyerTransfers.map((transfer) => (
                    <div
                      key={transfer.delivery_note_id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-orange-300 transition-colors"
                    >
                      {/* Transfer Header */}
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-orange-600">{transfer.delivery_note_number}</span>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              transfer.status === 'DRAFT' ? 'bg-yellow-100 text-yellow-700' :
                              transfer.status === 'ISSUED' ? 'bg-blue-100 text-blue-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {transfer.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">From: {transfer.created_by}</p>
                          {transfer.delivery_date && (
                            <p className="text-xs text-gray-400">
                              Date: {new Date(transfer.delivery_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleReceiveBuyerTransfer(transfer.delivery_note_id)}
                          disabled={receivingTransferId === transfer.delivery_note_id}
                          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-white transition-colors ${
                            receivingTransferId === transfer.delivery_note_id
                              ? 'bg-gray-400 cursor-not-allowed'
                              : 'bg-green-600 hover:bg-green-700'
                          }`}
                        >
                          {receivingTransferId === transfer.delivery_note_id ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Receiving...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              <span>Receive</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Materials List */}
                      <div className="bg-gray-50 rounded-lg p-3 mt-3">
                        <p className="text-xs font-medium text-gray-500 mb-2">Materials ({transfer.total_items})</p>
                        <div className="space-y-1">
                          {transfer.items.map((item, idx) => (
                            <div key={item.item_id || idx} className="flex justify-between text-sm">
                              <span className="text-gray-700">{item.material_name}</span>
                              <span className="text-gray-500 font-medium">{item.quantity} {item.unit}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Transport Info */}
                      {(transfer.vehicle_number || transfer.driver_name) && (
                        <div className="flex items-center space-x-4 mt-3 text-xs text-gray-500">
                          {transfer.vehicle_number && <span>Vehicle: {transfer.vehicle_number}</span>}
                          {transfer.driver_name && <span>Driver: {transfer.driver_name}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
              <p className="text-sm text-gray-500">
                {buyerTransfers.length} pending transfer{buyerTransfers.length !== 1 ? 's' : ''}
              </p>
              <button
                onClick={() => setShowBuyerTransfersModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockInPage;
