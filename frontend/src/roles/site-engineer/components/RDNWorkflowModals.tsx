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
  // Filter selection to only show materials for the selected project
  const initialSelection = selectedProjectId
    ? selectedMaterialsCart.filter(m => m.project_id === selectedProjectId)
    : selectedMaterialsCart;

  const [tempSelection, setTempSelection] = React.useState<Material[]>(initialSelection);

  React.useEffect(() => {
    if (show) {
      // When modal opens, filter to selected project's materials only
      const filtered = selectedProjectId
        ? selectedMaterialsCart.filter(m => m.project_id === selectedProjectId)
        : selectedMaterialsCart;
      setTempSelection(filtered);
    }
  }, [show, selectedMaterialsCart, selectedProjectId]);

  const handleToggleSelect = (project: ReturnableProject, material: ReturnableProject['materials'][0]) => {
    const existing = tempSelection.find(m => m.delivery_note_item_id === material.delivery_note_item_id);

    if (existing) {
      setTempSelection(tempSelection.filter(m => m.delivery_note_item_id !== material.delivery_note_item_id));
    } else {
      setTempSelection([...tempSelection, {
        delivery_note_item_id: material.delivery_note_item_id,
        inventory_material_id: material.inventory_material_id,
        material_name: material.material_name,
        material_code: material.material_code,
        unit: material.unit,
        quantity: material.returnable_quantity,
        max_quantity: material.returnable_quantity,
        condition: 'Good',
        return_reason: '',
        original_dn: material.delivery_note_number,
        project_id: project.project_id,
        project_name: project.project_name,
      }]);
    }
  };

  const handleUpdateMaterial = (delivery_note_item_id: number, updates: Partial<Material>) => {
    setTempSelection(tempSelection.map(m =>
      m.delivery_note_item_id === delivery_note_item_id ? { ...m, ...updates } : m
    ));
  };

  const handleSave = () => {
    // Validate quantities
    const invalidMaterials = tempSelection.filter(
      m => !m.quantity || m.quantity <= 0 || m.quantity > m.max_quantity || isNaN(m.quantity)
    );

    if (invalidMaterials.length > 0) {
      showError('Please enter valid quantities for all selected materials');
      return;
    }

    if (tempSelection.length === 0) {
      showError('Please select at least one material');
      return;
    }

    // Merge with existing selections from OTHER projects (keep them, update this project's selections)
    if (selectedProjectId) {
      const otherProjectSelections = selectedMaterialsCart.filter(m => m.project_id !== selectedProjectId);
      onSaveSelection([...otherProjectSelections, ...tempSelection]);
    } else {
      onSaveSelection(tempSelection);
    }
    showSuccess(`${tempSelection.length} material(s) saved to cart`);
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
                    <p className="text-sm text-white/80">Choose materials and save your selection</p>
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
              {returnableProjects.filter(p => p.materials.some(m => m.returnable_quantity > 0)).length === 0 ? (
                <div className="text-center py-12">
                  <CubeIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No returnable materials available</p>
                </div>
              ) : (
                returnableProjects
                  .filter((project) => project.materials.some(m => m.returnable_quantity > 0))
                  .map((project) => (
                  <div key={project.project_id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <BuildingOfficeIcon className="w-5 h-5 text-indigo-600" />
                      <h5 className="font-semibold text-gray-900">{project.project_name}</h5>
                      <span className="text-xs text-gray-500">({project.project_code})</span>
                    </div>
                    <div className="space-y-3">
                      {project.materials
                        .filter((material) => material.returnable_quantity > 0)
                        .map((material) => {
                        const isSelected = tempSelection.some(
                          m => m.delivery_note_item_id === material.delivery_note_item_id
                        );
                        const selectedMaterial = tempSelection.find(
                          m => m.delivery_note_item_id === material.delivery_note_item_id
                        );

                        return (
                          <div
                            key={material.delivery_note_item_id}
                            className={`bg-white p-3 rounded border-2 transition-all ${
                              isSelected
                                ? 'border-purple-400 bg-purple-50'
                                : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelect(project, material)}
                                className="mt-1 w-4 h-4 text-purple-600 cursor-pointer"
                              />
                              <div className="flex-1">
                                <div
                                  className="flex items-center justify-between mb-2 cursor-pointer"
                                  onClick={() => handleToggleSelect(project, material)}
                                >
                                  <div>
                                    <p className="font-medium text-gray-900">{material.material_name}</p>
                                    <p className="text-xs text-gray-500">
                                      {material.material_code} • DN: {material.delivery_note_number}
                                    </p>
                                  </div>
                                  <span className="text-sm font-semibold text-purple-600">
                                    Max: {material.returnable_quantity} {material.unit}
                                  </span>
                                </div>

                                {isSelected && selectedMaterial && (
                                  <div className="mt-3 space-y-2 pl-2 border-l-2 border-purple-200" onClick={(e) => e.stopPropagation()}>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Quantity *</label>
                                        <input
                                          type="number"
                                          min="0"
                                          max={material.returnable_quantity}
                                          step="0.001"
                                          value={selectedMaterial.quantity}
                                          onChange={(e) => handleUpdateMaterial(material.delivery_note_item_id, {
                                            quantity: parseFloat(e.target.value)
                                          })}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Condition *</label>
                                        <select
                                          value={selectedMaterial.condition}
                                          onChange={(e) => handleUpdateMaterial(material.delivery_note_item_id, {
                                            condition: e.target.value as 'Good' | 'Damaged' | 'Defective'
                                          })}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                                        >
                                          <option value="Good">Good</option>
                                          <option value="Damaged">Damaged</option>
                                          <option value="Defective">Defective</option>
                                        </select>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">Return Reason</label>
                                      <input
                                        type="text"
                                        value={selectedMaterial.return_reason}
                                        onChange={(e) => handleUpdateMaterial(material.delivery_note_item_id, {
                                          return_reason: e.target.value
                                        })}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder="Why is this being returned?"
                                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              {tempSelection.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-green-800">
                      {tempSelection.length} material(s) selected
                    </p>
                    <button
                      onClick={() => setTempSelection([])}
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
                disabled={tempSelection.length === 0}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Save Selection ({tempSelection.length})
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
