import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XMarkIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  BuildingOfficeIcon,
  CubeIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { showError, showSuccess, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { FileText } from 'lucide-react';

interface Material {
  delivery_note_item_id: number;
  inventory_material_id: number;
  material_name: string;
  material_code: string;
  unit: string;
  quantity: number;
  max_quantity: number;
  condition: 'Good' | 'Damaged' | 'Defective';
  return_reason: string;
  original_dn: string;
  project_id: number;
  project_name: string;
}

interface ReturnableProject {
  project_id: number;
  project_name: string;
  project_code: string;
  location?: string;
  materials: Array<{
    delivery_note_item_id: number;
    inventory_material_id: number;
    material_name: string;
    material_code: string;
    unit: string;
    dispatched_quantity: number;
    returned_quantity: number;
    returnable_quantity: number;
    delivery_note_number: string;
    brand?: string;
  }>;
}

interface MaterialSelectionModalProps {
  show: boolean;
  onClose: () => void;
  returnableProjects: ReturnableProject[];
  selectedMaterialsCart: Material[];
  onSaveSelection: (materials: Material[]) => void;
  selectedProjectId?: number | null;
}

interface RDNCreationModalProps {
  show: boolean;
  onClose: () => void;
  selectedMaterials: Material[];
  onCreateRDN: (rdnData: {
    return_date: string;
    vehicle_number: string;
    driver_name: string;
    driver_contact: string;
    notes: string;
    transport_fee?: number;
  }, deliveryNoteFile?: File | null) => Promise<void>;
  creating: boolean;
}

interface RDNSuccessModalProps {
  show: boolean;
  onClose: () => void;
  rdnNumber: string;
  onDownloadPDF: () => void;
}

// STEP 1: Material Selection Modal (Shopping Cart)
export const MaterialSelectionModal: React.FC<MaterialSelectionModalProps> = ({
  show,
  onClose,
  returnableProjects,
  selectedMaterialsCart,
  onSaveSelection,
  selectedProjectId,
}) => {
  // Track which materials are checked (by delivery_note_item_id)
  const [checkedItems, setCheckedItems] = React.useState<Set<number>>(new Set());

  // Multi-condition split state per material
  const [conditionSplits, setConditionSplits] = React.useState<Record<number, {
    good: number;
    damaged: number;
    defective: number;
    return_reason: string;
    damage_description_damaged: string;
    damage_description_defective: string;
    // Store material info for building cart later
    _meta: {
      delivery_note_item_id: number;
      inventory_material_id: number;
      material_name: string;
      material_code: string;
      unit: string;
      max_quantity: number;
      original_dn: string;
      project_id: number;
      project_name: string;
    };
  }>>({});

  React.useEffect(() => {
    if (show) {
      // Rebuild checked items and condition splits from existing cart
      const filtered = selectedProjectId
        ? selectedMaterialsCart.filter(m => m.project_id === selectedProjectId)
        : selectedMaterialsCart;

      const checked = new Set<number>();
      const splits: typeof conditionSplits = {};

      // Group existing cart entries by delivery_note_item_id
      const grouped = new Map<number, Material[]>();
      for (const m of filtered) {
        const existing = grouped.get(m.delivery_note_item_id) || [];
        existing.push(m);
        grouped.set(m.delivery_note_item_id, existing);
      }

      for (const [itemId, materials] of grouped) {
        checked.add(itemId);
        const first = materials[0];
        splits[itemId] = {
          good: materials.filter(m => m.condition === 'Good').reduce((s, m) => s + m.quantity, 0),
          damaged: materials.filter(m => m.condition === 'Damaged').reduce((s, m) => s + m.quantity, 0),
          defective: materials.filter(m => m.condition === 'Defective').reduce((s, m) => s + m.quantity, 0),
          return_reason: first.return_reason || '',
          damage_description_damaged: '',
          damage_description_defective: '',
          _meta: {
            delivery_note_item_id: first.delivery_note_item_id,
            inventory_material_id: first.inventory_material_id,
            material_name: first.material_name,
            material_code: first.material_code,
            unit: first.unit,
            max_quantity: first.max_quantity,
            original_dn: first.original_dn,
            project_id: first.project_id,
            project_name: first.project_name,
          },
        };
      }

      setCheckedItems(checked);
      setConditionSplits(splits);
    }
  }, [show, selectedMaterialsCart, selectedProjectId]);

  const handleToggleSelect = (project: ReturnableProject, material: ReturnableProject['materials'][0]) => {
    const itemId = material.delivery_note_item_id;

    if (checkedItems.has(itemId)) {
      // Uncheck - remove from checked and splits
      setCheckedItems(prev => { const next = new Set(prev); next.delete(itemId); return next; });
      setConditionSplits(prev => { const next = { ...prev }; delete next[itemId]; return next; });
    } else {
      // Check - add with all qty defaulting to Good
      setCheckedItems(prev => new Set(prev).add(itemId));
      setConditionSplits(prev => ({
        ...prev,
        [itemId]: {
          good: material.returnable_quantity,
          damaged: 0,
          defective: 0,
          return_reason: '',
          damage_description_damaged: '',
          damage_description_defective: '',
          _meta: {
            delivery_note_item_id: material.delivery_note_item_id,
            inventory_material_id: material.inventory_material_id,
            material_name: material.material_name,
            material_code: material.material_code,
            unit: material.unit,
            max_quantity: material.returnable_quantity,
            original_dn: material.delivery_note_number,
            project_id: project.project_id,
            project_name: project.project_name,
          },
        },
      }));
    }
  };

  const updateSplit = (itemId: number, field: string, value: number | string) => {
    setConditionSplits(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const handleSave = () => {
    if (checkedItems.size === 0) {
      showError('Please select at least one material');
      return;
    }

    // Validate each checked material's condition split
    for (const itemId of checkedItems) {
      const split = conditionSplits[itemId];
      if (!split) continue;
      const total = split.good + split.damaged + split.defective;
      if (total === 0) {
        showError(`Please enter at least 1 unit for "${split._meta.material_name}"`);
        return;
      }
      if (total > split._meta.max_quantity) {
        showError(`Total (${total}) exceeds available (${split._meta.max_quantity}) for "${split._meta.material_name}"`);
        return;
      }
      if (split.damaged > 0 && !split.damage_description_damaged.trim()) {
        showError(`Please provide description for Damaged condition on "${split._meta.material_name}"`);
        return;
      }
      if (split.defective > 0 && !split.damage_description_defective.trim()) {
        showError(`Please provide description for Defective condition on "${split._meta.material_name}"`);
        return;
      }
    }

    // Build cart entries - one Material per condition with qty > 0
    const newSelections: Material[] = [];
    for (const itemId of checkedItems) {
      const split = conditionSplits[itemId];
      if (!split) continue;
      const { _meta } = split;

      const conditions: Array<{ key: 'good' | 'damaged' | 'defective'; label: 'Good' | 'Damaged' | 'Defective'; descKey?: 'damage_description_damaged' | 'damage_description_defective' }> = [
        { key: 'good', label: 'Good' },
        { key: 'damaged', label: 'Damaged', descKey: 'damage_description_damaged' },
        { key: 'defective', label: 'Defective', descKey: 'damage_description_defective' },
      ];

      for (const { key, label, descKey } of conditions) {
        if (split[key] > 0) {
          newSelections.push({
            delivery_note_item_id: _meta.delivery_note_item_id,
            inventory_material_id: _meta.inventory_material_id,
            material_name: _meta.material_name,
            material_code: _meta.material_code,
            unit: _meta.unit,
            quantity: split[key],
            max_quantity: _meta.max_quantity,
            condition: label,
            return_reason: (descKey ? split[descKey] : split.return_reason) || split.return_reason,
            original_dn: _meta.original_dn,
            project_id: _meta.project_id,
            project_name: _meta.project_name,
          });
        }
      }
    }

    // Merge with existing selections from OTHER projects
    if (selectedProjectId) {
      const otherProjectSelections = selectedMaterialsCart.filter(m => m.project_id !== selectedProjectId);
      onSaveSelection([...otherProjectSelections, ...newSelections]);
    } else {
      onSaveSelection(newSelections);
    }
    const totalUnits = newSelections.reduce((s, m) => s + m.quantity, 0);
    showSuccess(`${checkedItems.size} material(s) saved (${totalUnits} units across ${newSelections.length} condition line(s))`);
    onClose();
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500 to-indigo-500 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <CubeIcon className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-white">
                    <h3 className="text-lg font-semibold">STEP 1: Select Materials to Return</h3>
                    <p className="text-sm text-white/80">View details and select returnable materials</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)] space-y-4">
              {returnableProjects.length === 0 ? (
                <div className="text-center py-12">
                  <CubeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No materials found</p>
                </div>
              ) : (
                returnableProjects.map((project) => (
                  <div key={project.project_id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <BuildingOfficeIcon className="w-5 h-5 text-indigo-600" />
                      <h5 className="font-semibold text-gray-900">{project.project_name}</h5>
                      <span className="text-xs text-gray-500">({project.project_code})</span>
                    </div>

                    {/* Table header for material details */}
                    <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 items-center px-3 py-2 bg-gray-100 rounded-t-lg border border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="w-4"></div>
                      <div>Material</div>
                      <div className="text-center w-16">Dispatched</div>
                      <div className="text-center w-16">Returned</div>
                      <div className="text-center w-16">Returnable</div>
                      <div className="w-20"></div>
                    </div>

                    <div className="space-y-0 border-x border-b border-gray-200 rounded-b-lg overflow-hidden">
                      {project.materials.map((material) => {
                        const isReturnable = material.returnable_quantity > 0;
                        const itemId = material.delivery_note_item_id;
                        const isSelected = checkedItems.has(itemId);
                        const split = conditionSplits[itemId];

                        return (
                          <div key={itemId}>
                            {/* Material Row */}
                            <div
                              className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 items-center px-3 py-3 transition-all ${
                                isSelected
                                  ? 'bg-purple-50 border-l-2 border-l-purple-400'
                                  : isReturnable
                                  ? 'bg-white hover:bg-purple-50/50'
                                  : 'bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => isReturnable && handleToggleSelect(project, material)}
                                disabled={!isReturnable}
                                className={`w-4 h-4 ${isReturnable ? 'text-purple-600 cursor-pointer' : 'text-gray-300 cursor-not-allowed'}`}
                              />
                              <div
                                className={isReturnable ? 'cursor-pointer' : ''}
                                onClick={() => isReturnable && handleToggleSelect(project, material)}
                              >
                                <p className={`font-medium text-sm ${isReturnable ? 'text-gray-900' : 'text-gray-400'}`}>{material.material_name}</p>
                                <p className="text-xs text-gray-400">
                                  {material.material_code} • DN: {material.delivery_note_number}
                                </p>
                              </div>
                              <div className="text-center w-16 text-sm text-gray-700">{material.dispatched_quantity} {material.unit}</div>
                              <div className="text-center w-16 text-sm text-gray-700">{material.returned_quantity} {material.unit}</div>
                              <div className={`text-center w-16 text-sm font-semibold ${isReturnable ? 'text-purple-600' : 'text-red-500'}`}>
                                {material.returnable_quantity} {material.unit}
                              </div>
                              <div className="w-20 text-right">
                                {!isReturnable && (
                                  <span className="text-xs text-gray-400 italic">Fully returned</span>
                                )}
                              </div>
                            </div>

                            {/* Expanded: Multi-Condition Split */}
                            {isSelected && split && (
                              <div className="px-6 pb-3 pt-2 bg-purple-50 border-l-2 border-l-purple-400" onClick={(e) => e.stopPropagation()}>
                                <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Split by Condition</p>
                                <div className="space-y-2">
                                  {/* Good */}
                                  <div className="flex items-center gap-3">
                                    <span className="w-20 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded text-center">Good</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max={material.returnable_quantity}
                                      step="0.001"
                                      value={split.good || ''}
                                      placeholder="0"
                                      onChange={(e) => updateSplit(itemId, 'good', Math.max(0, parseFloat(e.target.value) || 0))}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-center"
                                    />
                                  </div>

                                  {/* Damaged */}
                                  <div className="flex items-start gap-3">
                                    <span className="w-20 text-xs font-medium text-orange-700 bg-orange-50 px-2 py-1 rounded text-center mt-0.5">Damaged</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max={material.returnable_quantity}
                                      step="0.001"
                                      value={split.damaged || ''}
                                      placeholder="0"
                                      onChange={(e) => updateSplit(itemId, 'damaged', Math.max(0, parseFloat(e.target.value) || 0))}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-center"
                                    />
                                    {split.damaged > 0 && (
                                      <input
                                        type="text"
                                        value={split.damage_description_damaged}
                                        onChange={(e) => updateSplit(itemId, 'damage_description_damaged', e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder="Describe damage..."
                                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                      />
                                    )}
                                  </div>

                                  {/* Defective */}
                                  <div className="flex items-start gap-3">
                                    <span className="w-20 text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded text-center mt-0.5">Defective</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max={material.returnable_quantity}
                                      step="0.001"
                                      value={split.defective || ''}
                                      placeholder="0"
                                      onChange={(e) => updateSplit(itemId, 'defective', Math.max(0, parseFloat(e.target.value) || 0))}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-center"
                                    />
                                    {split.defective > 0 && (
                                      <input
                                        type="text"
                                        value={split.damage_description_defective}
                                        onChange={(e) => updateSplit(itemId, 'damage_description_defective', e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder="Describe defect..."
                                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                      />
                                    )}
                                  </div>
                                </div>

                                {/* Total + Return Reason */}
                                {(() => {
                                  const total = split.good + split.damaged + split.defective;
                                  const isOver = total > material.returnable_quantity;
                                  const isEmpty = total === 0;
                                  return (
                                    <>
                                      <div className={`mt-2 pt-2 border-t flex items-center justify-between text-xs font-medium ${isOver ? 'border-red-300' : 'border-purple-200'}`}>
                                        <span className={isOver ? 'text-red-600' : isEmpty ? 'text-amber-600' : 'text-gray-600'}>
                                          Total: {total} of {material.returnable_quantity}
                                        </span>
                                        {isOver && <span className="text-red-600">Exceeds available!</span>}
                                        {isEmpty && <span className="text-amber-600">Enter at least 1 unit</span>}
                                        {!isOver && !isEmpty && total < material.returnable_quantity && (
                                          <span className="text-gray-400">Partial return ({material.returnable_quantity - total} remaining)</span>
                                        )}
                                      </div>
                                      {split.damaged > 0 && !split.damage_description_damaged.trim() && (
                                        <p className="text-xs text-amber-600 mt-1">* Description required for Damaged</p>
                                      )}
                                      {split.defective > 0 && !split.damage_description_defective.trim() && (
                                        <p className="text-xs text-amber-600 mt-1">* Description required for Defective</p>
                                      )}
                                    </>
                                  );
                                })()}

                                {/* Return Reason */}
                                <div className="mt-2">
                                  <input
                                    type="text"
                                    value={split.return_reason}
                                    onChange={(e) => updateSplit(itemId, 'return_reason', e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    placeholder="Return reason (optional)"
                                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              {checkedItems.size > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-green-800">
                      {checkedItems.size} material(s) selected
                    </p>
                    <button
                      onClick={() => { setCheckedItems(new Set()); setConditionSplits({}); }}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={checkedItems.size === 0}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Save Selection ({checkedItems.size})
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// STEP 2: RDN Creation Modal (After materials are saved)
export const RDNCreationModal: React.FC<RDNCreationModalProps> = ({
  show,
  onClose,
  selectedMaterials,
  onCreateRDN,
  creating,
}) => {
  const [rdnForm, setRdnForm] = React.useState({
    return_date: new Date().toISOString().split('T')[0],
    vehicle_number: '',
    driver_name: '',
    driver_contact: '',
    notes: '',
    transport_fee: 0,
  });
  const [deliveryNoteFile, setDeliveryNoteFile] = React.useState<File | null>(null);

  const handleSubmit = async () => {
    if (!rdnForm.driver_name) {
      showError('Driver name is required');
      return;
    }

    if (!deliveryNoteFile) {
      showError('Please upload a delivery note');
      return;
    }

    await onCreateRDN(rdnForm, deliveryNoteFile);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <DocumentTextIcon className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-white">
                    <h3 className="text-lg font-semibold">STEP 2: Create Return Delivery Note</h3>
                    <p className="text-sm text-white/80">Enter transport and return details</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  disabled={creating}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  <XMarkIcon className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)] space-y-4">
              {/* Selected Materials Summary */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h5 className="font-semibold text-purple-900 mb-2">Selected Materials ({selectedMaterials.length})</h5>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {selectedMaterials.map((material, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-900">{material.material_name}</span>
                      <span className="font-medium text-purple-600">
                        {material.quantity} {material.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Return Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Return Date *</label>
                <input
                  type="date"
                  value={rdnForm.return_date}
                  onChange={(e) => setRdnForm({ ...rdnForm, return_date: e.target.value })}
                  disabled={creating}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                />
              </div>

              {/* Vehicle & Driver Details */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
                  <input
                    type="text"
                    value={rdnForm.vehicle_number}
                    onChange={(e) => setRdnForm({ ...rdnForm, vehicle_number: e.target.value })}
                    placeholder="e.g., DXB-A-12345"
                    disabled={creating}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name *</label>
                  <input
                    type="text"
                    value={rdnForm.driver_name}
                    onChange={(e) => setRdnForm({ ...rdnForm, driver_name: e.target.value })}
                    placeholder="Driver name"
                    disabled={creating}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Driver Contact</label>
                  <input
                    type="text"
                    value={rdnForm.driver_contact}
                    onChange={(e) => setRdnForm({ ...rdnForm, driver_contact: e.target.value })}
                    placeholder="+971 50 123 4567"
                    disabled={creating}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Transport Fee Calculation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter total transport fee <span className="text-xs text-gray-500 font-normal">(Default: 1.00 AED per unit)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rdnForm.transport_fee || ''}
                  onChange={(e) => setRdnForm({ ...rdnForm, transport_fee: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  disabled={creating}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:opacity-50"
                />
                <p className="text-xs text-gray-500 mt-1.5 flex items-start">
                  <svg className="w-4 h-4 text-gray-400 mr-1 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  This is the total transport cost paid for material delivered.
                </p>

                {/* Total Transport Fee Display */}
                {(rdnForm.transport_fee ?? 0) > 0 && (
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-4 shadow-sm mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm text-blue-900 font-semibold">
                          Total Transport Fee:
                        </span>
                      </div>
                      <span className="text-lg font-bold text-blue-900">
                        AED {(rdnForm.transport_fee ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-white rounded-md p-2 border border-blue-200">
                      <p className="text-xs text-blue-800 font-medium">
                        📊 Calculation: 1 × {(rdnForm.transport_fee ?? 0).toFixed(2)} = <span className="font-bold">{(rdnForm.transport_fee ?? 0).toFixed(2)} AED</span>
                      </p>
                    </div>
                  </div>
                )}

                <p className="text-xs text-amber-600 italic mt-2">
                  ⚡ Total transport fee will be calculated automatically when you enter the quantity
                </p>
              </div>

              {/* Delivery Note Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4 inline mr-1" />
                  Delivery Note from Vendor <span className="text-red-500">*</span>
                </label>

                <div className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg bg-white">
                  <label
                    htmlFor="rdn-delivery-note-upload"
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded cursor-pointer transition-colors text-sm font-medium"
                  >
                    Browse...
                  </label>
                  <input
                    type="file"
                    id="rdn-delivery-note-upload"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        // Check file size (max 10MB)
                        if (file.size > 10 * 1024 * 1024) {
                          showError('File size must be less than 10MB');
                          e.target.value = '';
                          return;
                        }
                        setDeliveryNoteFile(file);
                      }
                    }}
                    disabled={creating}
                    className="hidden"
                  />
                  <span className="text-sm text-gray-600 flex-1">
                    {deliveryNoteFile ? deliveryNoteFile.name : 'No file selected.'}
                  </span>
                </div>

                <p className="text-xs text-gray-500 mt-1">
                  Upload delivery note, invoice, or receipt (PDF, JPG, PNG, DOC - Max 10MB)
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={rdnForm.notes}
                  onChange={(e) => setRdnForm({ ...rdnForm, notes: e.target.value })}
                  placeholder="Additional notes or return reason..."
                  rows={3}
                  disabled={creating}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={onClose}
                disabled={creating}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={creating || !rdnForm.driver_name}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                {creating ? (
                  <>
                    <ModernLoadingSpinners size="xs" />
                    Creating RDN...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-4 h-4" />
                    Create RDN
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Success Modal
export const RDNSuccessModal: React.FC<RDNSuccessModalProps> = ({ show, onClose, rdnNumber, onDownloadPDF }) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <CheckCircleIcon className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">RDN Issued Successfully!</h3>
              <p className="text-sm text-gray-600 mb-1">Return Delivery Note</p>
              <p className="text-2xl font-bold text-purple-600 mb-4">{rdnNumber}</p>
              <p className="text-sm text-gray-500 mb-6">
                The RDN has been issued and validated. You can now dispatch the materials back to the store.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={onDownloadPDF}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
              >
                <DocumentTextIcon className="w-5 h-5" />
                Download RDN PDF
              </button>
              <button
                onClick={onClose}
                className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
