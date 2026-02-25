import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, X, CheckCircle } from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { inventoryService, InventoryMaterial, CustomUnit } from '../services/inventoryService';
import { showError, showWarning, showSuccess } from '@/utils/toastHelper';

// ---------------------------------------------------------------------------
// Predefined units organized by category
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NewMaterialModalProps {
  isOpen: boolean;
  onClose: () => void;
  customUnits: CustomUnit[];
  onMaterialCreated: (material: InventoryMaterial) => void;
  onMaterialCreatedWithQty?: (material: InventoryMaterial, qty: number) => void;
  onCustomUnitCreated: (unit: CustomUnit) => void;
  defaultMaterialName?: string;
  defaultBrand?: string;
  defaultSize?: string;
  successMessage?: string;
  showQuantityField?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const NewMaterialModal: React.FC<NewMaterialModalProps> = ({
  isOpen,
  onClose,
  customUnits,
  onMaterialCreated,
  onMaterialCreatedWithQty,
  onCustomUnitCreated,
  defaultMaterialName = '',
  defaultBrand = '',
  defaultSize = '',
  successMessage,
  showQuantityField = false,
}) => {
  // Form state
  const [newMaterialData, setNewMaterialData] = useState({
    material_name: '',
    brand: '',
    size: '',
    category: '',
    unit: 'pcs',
    unit_price: 0,
    current_stock: 0,
    min_stock_level: 0,
    description: '',
  });
  const [savingNewMaterial, setSavingNewMaterial] = useState(false);
  const [acceptedQty, setAcceptedQty] = useState<number>(0);

  // Unit combobox state
  const [unitSearchTerm, setUnitSearchTerm] = useState('Pieces (pcs)');
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const unitDropdownRef = useRef<HTMLDivElement>(null);

  // Add custom unit inline modal
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [newUnitData, setNewUnitData] = useState({ value: '', label: '' });

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setNewMaterialData({
        material_name: defaultMaterialName,
        brand: defaultBrand,
        size: defaultSize,
        category: '',
        unit: 'pcs',
        unit_price: 0,
        current_stock: 0,
        min_stock_level: 0,
        description: '',
      });
      setUnitSearchTerm('Pieces (pcs)');
      setShowUnitDropdown(false);
      setAcceptedQty(0);
    }
  }, [isOpen, defaultMaterialName, defaultBrand, defaultSize]);

  // Close unit dropdown when clicking outside
  useEffect(() => {
    if (!showUnitDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (unitDropdownRef.current && !unitDropdownRef.current.contains(event.target as Node)) {
        setShowUnitDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUnitDropdown]);

  // Combined units list
  const allUnits = useMemo(() => {
    return [
      ...PREDEFINED_UNITS.map((u) => ({ value: u.value, label: u.label, category: u.category, isCustom: false })),
      ...customUnits.map((u) => ({ value: u.value, label: u.label, category: 'Custom Units', isCustom: true })),
    ];
  }, [customUnits]);

  // Filtered units based on search
  const filteredUnits = useMemo(() => {
    if (!unitSearchTerm.trim()) return allUnits;
    const search = unitSearchTerm.toLowerCase();
    return allUnits.filter(
      (unit) => unit.value.toLowerCase().includes(search) || unit.label.toLowerCase().includes(search),
    );
  }, [allUnits, unitSearchTerm]);

  const handleUnitSearchChange = (value: string) => {
    setUnitSearchTerm(value);
    setNewMaterialData((prev) => ({ ...prev, unit: value }));
    setShowUnitDropdown(true);
  };

  const handleSelectUnit = (unitValue: string) => {
    const selectedUnit = allUnits.find((u) => u.value === unitValue);
    setNewMaterialData((prev) => ({ ...prev, unit: unitValue }));
    setUnitSearchTerm(selectedUnit?.label || unitValue);
    setShowUnitDropdown(false);
  };

  const handleCreateCustomUnit = async () => {
    if (!newUnitData.value.trim() || !newUnitData.label.trim()) {
      showWarning('Please enter both unit value and label');
      return;
    }
    try {
      const createdUnit = await inventoryService.createCustomUnit(
        newUnitData.value.trim(),
        newUnitData.label.trim(),
      );
      onCustomUnitCreated(createdUnit);
      handleSelectUnit(createdUnit.value);
      setNewUnitData({ value: '', label: '' });
      setShowAddUnitModal(false);
      showSuccess('Custom unit created successfully!');
    } catch (error: unknown) {
      console.error('Error creating custom unit:', error);
      const message = error instanceof Error ? error.message : 'Failed to create custom unit';
      showError(message);
    }
  };

  const handleSaveNewMaterial = async () => {
    if (!newMaterialData.material_name.trim()) {
      showWarning('Please enter a material name');
      return;
    }
    if (!newMaterialData.unit.trim()) {
      showWarning('Please enter a unit');
      return;
    }
    if (newMaterialData.unit_price < 0 || isNaN(newMaterialData.unit_price)) {
      showWarning('Unit price must be a valid positive number');
      return;
    }
    if (newMaterialData.min_stock_level < 0 || isNaN(newMaterialData.min_stock_level)) {
      showWarning('Min stock level must be a valid positive number');
      return;
    }
    if (showQuantityField && (acceptedQty <= 0 || isNaN(acceptedQty))) {
      showWarning('Please enter the quantity received from the vendor');
      return;
    }

    setSavingNewMaterial(true);
    try {
      // Check if the unit exists in predefined or custom units
      const unitExists = allUnits.some((u) => u.value.toLowerCase() === newMaterialData.unit.toLowerCase());

      // If unit doesn't exist, create it first
      if (!unitExists) {
        try {
          const createdUnit = await inventoryService.createCustomUnit(
            newMaterialData.unit.toLowerCase().trim(),
            unitSearchTerm || newMaterialData.unit,
          );
          onCustomUnitCreated(createdUnit);
        } catch (error) {
          console.warn('Failed to create custom unit, continuing with material creation:', error);
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
        description: newMaterialData.description || undefined,
      });

      if (showQuantityField && onMaterialCreatedWithQty) {
        onMaterialCreatedWithQty(createdMaterial, acceptedQty);
      } else {
        onMaterialCreated(createdMaterial);
      }
      showSuccess(successMessage ?? 'Material created successfully!');
      onClose();
    } catch (error: unknown) {
      console.error('Error creating material:', error);
      const message = error instanceof Error ? error.message : 'Failed to create material. Please try again.';
      showError(message);
    } finally {
      setSavingNewMaterial(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center space-x-3">
            <Plus className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-bold text-gray-900">Add New Material</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <span className="text-2xl">&times;</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {/* Material Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Material Name *</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
              <input
                type="text"
                value={newMaterialData.size}
                onChange={(e) => setNewMaterialData({ ...newMaterialData, size: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="e.g., 10mm, 1L"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
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
                {filteredUnits.length === 0 ? (
                  <div className="px-4 py-3 text-gray-500 text-sm">
                    No units found. Type to add custom unit (will be created when you save material).
                  </div>
                ) : (
                  filteredUnits.map((unit) => (
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
                  ))
                )}
              </div>
            )}

            <p className="text-xs text-gray-500 mt-1">
              Search from {allUnits.length} units or add custom unit. Price will be set on first Stock In.
            </p>
          </div>

          {/* Min Stock Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock Level</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={newMaterialData.description}
              onChange={(e) => setNewMaterialData({ ...newMaterialData, description: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Optional description..."
            />
          </div>
        </div>

        {/* Quantity Received — only shown when called from inspection context */}
        {showQuantityField && (
          <div className="mx-6 mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <label className="block text-sm font-semibold text-amber-800 mb-1">
              Quantity Received from Vendor *
            </label>
            <p className="text-xs text-amber-600 mb-2">
              How many {newMaterialData.unit || 'units'} did the vendor deliver?
            </p>
            <input
              type="number"
              min={0.01}
              step="any"
              value={acceptedQty || ''}
              onChange={(e) => setAcceptedQty(parseFloat(e.target.value) || 0)}
              placeholder="Enter quantity..."
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm ${
                acceptedQty <= 0 ? 'border-amber-400 bg-white' : 'border-gray-300 bg-white'
              }`}
            />
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
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

      {/* Add Custom Unit Modal */}
      {showAddUnitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Add Custom Unit</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Value *</label>
                <input
                  type="text"
                  value={newUnitData.value}
                  onChange={(e) => setNewUnitData({ ...newUnitData, value: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="e.g., sqm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Label *</label>
                <input
                  type="text"
                  value={newUnitData.label}
                  onChange={(e) => setNewUnitData({ ...newUnitData, label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="e.g., Square Meters"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <button
                onClick={() => setShowAddUnitModal(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCustomUnit}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Create Unit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewMaterialModal;
