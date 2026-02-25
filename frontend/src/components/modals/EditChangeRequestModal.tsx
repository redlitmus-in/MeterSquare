import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, AlertCircle, Trash2, Package } from 'lucide-react';
import { changeRequestService, ChangeRequestItem } from '@/services/changeRequestService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { formatCurrency } from '@/utils/formatters';
import { useAuthStore } from '@/store/authStore';
import { MATERIAL_CONSUMING_STATUSES } from '@/lib/constants';

interface EditChangeRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  changeRequest: ChangeRequestItem;
  onSuccess?: () => void;
}

interface MaterialItem {
  id: string;
  material_name: string;
  sub_item_name: string;
  brand?: string;
  size?: string;
  specification?: string;
  quantity: number;
  original_boq_quantity?: number;  // Original BOQ quantity for validation
  already_purchased?: number;  // Already purchased in other requests
  se_requested_quantity?: number;  // SE's originally requested quantity (cap for PM edits)
  unit: string;
  unit_price: number;
  total_price: number;
  reason: string;
  master_material_id?: string | null;
  sub_item_id?: string;  // For tracking purchases
}

const EditChangeRequestModal: React.FC<EditChangeRequestModalProps> = ({
  isOpen,
  onClose,
  changeRequest,
  onSuccess
}) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [justification, setJustification] = useState('');
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [allChangeRequests, setAllChangeRequests] = useState<any[]>([]);

  // Check user role for various permissions
  const userRoleLower = user?.role?.toLowerCase() || '';
  const isSiteEngineer = userRoleLower === 'siteengineer' ||
                         userRoleLower === 'site engineer' ||
                         userRoleLower === 'site_engineer';

  const isProjectManager = userRoleLower === 'project manager' ||
                           userRoleLower === 'project_manager' ||
                           userRoleLower === 'projectmanager';

  // Hide price fields for Site Engineer and Project Manager
  const shouldHidePrices = isSiteEngineer || isProjectManager;

  // Check if user is Project Manager or Estimator - allow quantity editing
  const isProjectManagerOrEstimator =
    isProjectManager ||
    userRoleLower === 'estimator' ||
    userRoleLower === 'estimation';

  // Fetch all change requests for this BOQ to calculate already purchased quantities
  useEffect(() => {
    const fetchChangeRequests = async () => {
      if (changeRequest && isOpen && changeRequest.boq_id) {
        try {
          const response = await changeRequestService.getBOQChangeRequests(changeRequest.boq_id);
          if (response.success && response.data) {
            // Store ALL requests (including current) - we'll filter later for calculations
            setAllChangeRequests(response.data || []);
          }
        } catch (error) {
          console.error('Error fetching change requests:', error);
        }
      }
    };
    fetchChangeRequests();
  }, [changeRequest, isOpen]);

  // Initialize form data when modal opens
  useEffect(() => {
    if (changeRequest && isOpen && allChangeRequests.length > 0) {
      setJustification(changeRequest.justification || '');

      // Find the current request in allChangeRequests to get enriched data with original_boq_quantity
      const currentRequestEnriched = allChangeRequests.find(
        (req: any) => req.cr_id === changeRequest.cr_id
      );

      // Use enriched data if available, fallback to original
      const dataSource = currentRequestEnriched || changeRequest;
      const existingMaterials = dataSource.sub_items_data || dataSource.materials_data || [];

      if (existingMaterials.length > 0) {
        const loadedMaterials: MaterialItem[] = existingMaterials.map((item: any, index: number) => {
          const boqQty = item.original_boq_quantity || item.boq_quantity;

          // Calculate already purchased quantity for this material
          // Uses centralized config to prevent over-allocation
          let alreadyPurchased = 0;
          if (item.master_material_id) {
            alreadyPurchased = allChangeRequests
              .filter((req: any) =>
                MATERIAL_CONSUMING_STATUSES.includes(req.status) &&
                req.cr_id !== changeRequest.cr_id
              )
              .reduce((total, req) => {
                // Check both materials_data and sub_items_data
                const allMaterials = [
                  ...(req.materials_data || []),
                  ...(req.sub_items_data || [])
                ];
                // Match by material ID AND sub_item for per-sub-item tracking
                const matchingMaterial = allMaterials.find(
                  (m: any) => m.master_material_id === item.master_material_id &&
                              (m.sub_item_id === item.sub_item_id ||
                               m.sub_item_name === item.sub_item_name ||
                               String(m.sub_item_id) === String(item.sub_item_id))
                );
                return total + (matchingMaterial ? (matchingMaterial.quantity || 0) : 0);
              }, 0);
          }

          // SE's original quantity: use original_quantity if available (set after first edit),
          // otherwise the current quantity IS the SE's original (first time PM opens edit)
          const seOriginalQty = item.original_quantity != null
            ? parseFloat(item.original_quantity)
            : parseFloat(item.quantity || item.qty || 0);

          // Determine the available BOQ quantity for this material
          let quantity = parseFloat(item.quantity || item.qty || 0);
          const parsedBoqQty = boqQty != null ? parseFloat(boqQty) : undefined;
          if (parsedBoqQty !== undefined) {
            const availableBoqQty = parsedBoqQty - alreadyPurchased;
            // Auto-set quantity to available BOQ qty if current exceeds it
            if (availableBoqQty > 0 && quantity > availableBoqQty) {
              quantity = availableBoqQty;
            }
          }

          const materialData = {
            id: `existing-${index}`,
            material_name: item.material_name || item.sub_item_name || '',
            sub_item_name: item.sub_item_name || item.material_name || '',
            brand: item.brand || '',
            size: item.size || item.dimensions || item.size_dimension || '',
            specification: item.specification || item.spec || '',
            quantity,
            original_boq_quantity: parsedBoqQty,
            already_purchased: alreadyPurchased,
            se_requested_quantity: seOriginalQty,
            unit: item.unit || 'nos',
            unit_price: parseFloat(item.unit_price || item.unit_rate || 0),
            total_price: quantity * parseFloat(item.unit_price || item.unit_rate || 0),
            reason: item.reason || '',
            master_material_id: item.master_material_id || null,
            sub_item_id: item.sub_item_id || null
          };

          return materialData;
        });
        setMaterials(loadedMaterials);
      } else {
        // Fallback - create one empty material
        setMaterials([createEmptyMaterial()]);
      }
    }
  }, [changeRequest, isOpen, allChangeRequests]);

  const createEmptyMaterial = (): MaterialItem => ({
    id: `new-${Date.now()}-${Math.random()}`,
    material_name: '',
    sub_item_name: '',
    quantity: 0,
    unit: 'nos',
    unit_price: 0,
    total_price: 0,
    reason: ''
  });

  const handleRemoveMaterial = (id: string) => {
    if (materials.length === 1) {
      showError('At least one material is required');
      return;
    }
    setMaterials(materials.filter(m => m.id !== id));
  };

  const handleMaterialChange = (id: string, field: keyof MaterialItem, value: any) => {
    setMaterials(materials.map(m => {
      if (m.id === id) {
        const updated = { ...m, [field]: value };

        // Auto-calculate total_price when quantity or unit_price changes
        if (field === 'quantity' || field === 'unit_price') {
          updated.total_price = updated.quantity * updated.unit_price;
        }

        // Sync material_name and sub_item_name
        if (field === 'material_name') {
          updated.sub_item_name = value;
        }
        if (field === 'sub_item_name') {
          updated.material_name = value;
        }

        return updated;
      }
      return m;
    }));
  };

  const calculateTotals = () => {
    const totalCost = materials.reduce((sum, m) => sum + m.total_price, 0);
    return { totalCost };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!justification.trim()) {
      showError('Please provide justification for the change');
      return;
    }

    // Validate materials - unit price is now optional
    const invalidMaterial = materials.find(m => {
      // Basic validation for all materials
      if (!m.material_name.trim() || m.quantity <= 0 || !m.reason.trim()) {
        return true;
      }
      return false;
    });

    if (invalidMaterial) {
      showError('Please fill all material fields correctly (name, quantity > 0, reason)');
      return;
    }

    // Validate that existing BOQ materials don't exceed remaining BOQ quantity
    const exceedingBOQMaterial = materials.find(m => {
      if (!m.master_material_id || !m.original_boq_quantity) return false;
      const hasValidId = typeof m.master_material_id === 'string' && m.master_material_id.startsWith('mat_');
      if (!hasValidId) return false;
      const remaining = m.original_boq_quantity - (m.already_purchased || 0);
      if (remaining <= 0) return false; // Treated as new purchase, no limit
      return m.quantity > remaining;
    });

    if (exceedingBOQMaterial) {
      const remaining = (exceedingBOQMaterial.original_boq_quantity || 0) - (exceedingBOQMaterial.already_purchased || 0);
      showError(`Material "${exceedingBOQMaterial.material_name}" quantity (${exceedingBOQMaterial.quantity}) exceeds available BOQ quantity (${remaining} ${exceedingBOQMaterial.unit}). BOQ total: ${exceedingBOQMaterial.original_boq_quantity}, already purchased: ${exceedingBOQMaterial.already_purchased || 0}`);
      return;
    }

    setLoading(true);
    try {
      // Prepare materials data for API
      const materialsData = materials.map(m => ({
        material_name: m.material_name,
        sub_item_name: m.sub_item_name,
        brand: m.brand || '',
        size: m.size || '',
        specification: m.specification || '',
        quantity: m.quantity,
        unit: m.unit,
        unit_price: m.unit_price,
        total_price: m.total_price,
        reason: m.reason,
        master_material_id: m.master_material_id || undefined
      }));

      const response = await changeRequestService.updateChangeRequest(changeRequest.cr_id, {
        justification: justification,
        materials: materialsData
      });

      if (response.success) {
        showSuccess('PO updated successfully');
        if (onSuccess) onSuccess();
        onClose();
      } else {
        showError(response.message || 'Failed to update PO');
      }
    } catch (error: any) {
      console.error('Error updating PO:', error);
      showError(error.response?.data?.error || 'Failed to update PO');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const { totalCost } = calculateTotals();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={onClose}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all w-full max-w-6xl max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                      <Package className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white">
                      Edit PO #{changeRequest.cr_id}
                    </h3>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
                    disabled={loading}
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <form onSubmit={handleSubmit} id="edit-form">
                  {/* Project/BOQ Info */}
                  <div className="mb-6 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Project & BOQ Information
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 text-xs">Project:</span>
                        <p className="font-semibold text-gray-900">{changeRequest.project_name || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs">BOQ:</span>
                        <p className="font-semibold text-gray-900">{changeRequest.boq_name || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs">Item:</span>
                        <p className="font-semibold text-gray-900">{changeRequest.item_name || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 text-xs">Requested By:</span>
                        <p className="font-semibold text-gray-900">{changeRequest.requested_by_name || 'N/A'}</p>
                      </div>
                    </div>
                  </div>


                  {/* Justification */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Justification <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Explain why this change request is necessary..."
                      required
                      disabled={loading}
                    />
                  </div>

                  {/* Materials List */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-gray-700">
                        Materials / Sub-Items <span className="text-red-500">*</span>
                      </h4>
                    </div>

                    <div className="space-y-4">
                      {materials.map((material, index) => {
                        // Determine if this is treated as a new material purchase
                        // Validate master_material_id format: should start with "mat_" (e.g., mat_666_1_1_1)
                        const hasValidMaterialId = material.master_material_id &&
                                                   (typeof material.master_material_id === 'string') &&
                                                   material.master_material_id.startsWith('mat_');
                        const isExistingBOQMaterial = hasValidMaterialId && material.original_boq_quantity !== undefined;
                        const remainingQty = isExistingBOQMaterial
                          ? material.original_boq_quantity - (material.already_purchased || 0)
                          : 0;
                        const isTreatedAsNew = isExistingBOQMaterial && remainingQty <= 0;

                        return (
                        <div key={material.id} className={`p-4 border rounded-lg shadow-sm ${
                          isTreatedAsNew ? 'border-orange-300 bg-orange-50' :
                          isExistingBOQMaterial ? 'border-blue-300 bg-blue-50' :
                          'border-gray-200 bg-white'
                        }`}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <h5 className="text-sm font-medium text-gray-700">Material #{index + 1}</h5>
                              {isExistingBOQMaterial && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                  isTreatedAsNew
                                    ? 'bg-orange-200 text-orange-800'
                                    : 'bg-blue-200 text-blue-800'
                                }`}>
                                  {isTreatedAsNew ? '⚠️ BOQ Fully Consumed - New Purchase' : '✓ From BOQ'}
                                </span>
                              )}
                              {!hasValidMaterialId && !isExistingBOQMaterial && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-green-200 text-green-800">
                                  New Material
                                </span>
                              )}
                            </div>
                            {materials.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMaterial(material.id)}
                                className="text-red-600 hover:text-red-800 transition-colors"
                                disabled={loading}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Material Name */}
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Material / Sub-Item Name <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={material.material_name}
                                onChange={(e) => handleMaterialChange(material.id, 'material_name', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="Enter material or sub-item name"
                                required
                                disabled={loading}
                              />
                            </div>

                            {/* Brand */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Brand
                              </label>
                              <input
                                type="text"
                                value={material.brand || ''}
                                onChange={(e) => handleMaterialChange(material.id, 'brand', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="Enter brand name"
                                disabled={loading}
                              />
                            </div>

                            {/* Size */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Size
                              </label>
                              <input
                                type="text"
                                value={material.size || ''}
                                onChange={(e) => handleMaterialChange(material.id, 'size', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="Enter size/dimensions"
                                disabled={loading}
                              />
                            </div>

                            {/* Specification */}
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Specification
                              </label>
                              <textarea
                                value={material.specification || ''}
                                onChange={(e) => handleMaterialChange(material.id, 'specification', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="Enter detailed specifications"
                                rows={2}
                                disabled={loading}
                              />
                            </div>

                            {/* Quantity */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Quantity <span className="text-red-500">*</span>
                                {isExistingBOQMaterial && !isTreatedAsNew && remainingQty > 0 && (
                                  <span className="text-xs text-blue-600 font-normal ml-1">
                                    (BOQ Available: {remainingQty} {material.unit})
                                  </span>
                                )}
                              </label>
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={material.quantity || ''}
                                onChange={(e) => {
                                  const newQty = parseFloat(e.target.value) || 0;
                                  if (isExistingBOQMaterial && !isTreatedAsNew && remainingQty > 0 && newQty > remainingQty) {
                                    showWarning(`Quantity cannot exceed remaining BOQ allocation of ${remainingQty} ${material.unit} (BOQ: ${material.original_boq_quantity}, already purchased: ${material.already_purchased || 0})`);
                                    handleMaterialChange(material.id, 'quantity', remainingQty);
                                    return;
                                  }
                                  handleMaterialChange(material.id, 'quantity', newQty);
                                }}
                                onWheel={(e) => e.currentTarget.blur()}
                                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                                  (!isProjectManagerOrEstimator && material.master_material_id !== null && material.master_material_id !== undefined) ? 'bg-gray-50 cursor-not-allowed' :
                                  (isExistingBOQMaterial && !isTreatedAsNew && remainingQty > 0 && material.quantity > remainingQty) ? 'border-red-500 bg-red-50' : ''
                                }`}
                                placeholder="0.00"
                                required
                                max={isExistingBOQMaterial && !isTreatedAsNew && remainingQty > 0 ? remainingQty : undefined}
                                disabled={loading || (!isProjectManagerOrEstimator && material.master_material_id !== null && material.master_material_id !== undefined)}
                              />
                              {/* BOQ Quantity indicator */}
                              {isExistingBOQMaterial && (
                                <div className="mt-1 flex items-center gap-2 text-[11px]">
                                  <span className="text-gray-500">BOQ Qty: <span className="font-semibold text-gray-700">{material.original_boq_quantity} {material.unit}</span></span>
                                  {(material.already_purchased || 0) > 0 && (
                                    <span className="text-orange-600">| Purchased: <span className="font-semibold">{material.already_purchased} {material.unit}</span></span>
                                  )}
                                  {!isTreatedAsNew && remainingQty > 0 && (
                                    <span className="text-blue-600">| Available: <span className="font-semibold">{remainingQty} {material.unit}</span></span>
                                  )}
                                  {isTreatedAsNew && (
                                    <span className="text-orange-600 font-medium">| Fully consumed</span>
                                  )}
                                </div>
                              )}
                              {!isExistingBOQMaterial && material.quantity > 0 && (
                                <p className="mt-1 text-[11px] text-gray-400">Not linked to BOQ</p>
                              )}
                            </div>

                            {/* Unit */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Unit <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={material.unit}
                                onChange={(e) => handleMaterialChange(material.id, 'unit', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50"
                                placeholder="nos, sqm, etc."
                                required
                                disabled={loading}
                                readOnly
                              />
                            </div>

                            {/* Unit Price - Hidden for Site Engineers and Project Managers */}
                            {!shouldHidePrices && (
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Unit Price (AED)
                                  {material.master_material_id && <span className="text-xs text-gray-500 font-normal ml-1">(BOQ Price)</span>}
                                </label>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={material.unit_price || ''}
                                  onChange={(e) => handleMaterialChange(material.id, 'unit_price', parseFloat(e.target.value) || 0)}
                                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${
                                    material.master_material_id ? 'bg-gray-50 cursor-not-allowed' : ''
                                  }`}
                                  placeholder={material.master_material_id ? "BOQ Price" : "0.00"}
                                  disabled={loading || (material.master_material_id !== null && material.master_material_id !== undefined)}
                                  readOnly={material.master_material_id !== null && material.master_material_id !== undefined}
                                />
                                {material.master_material_id && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    BOQ unit price is fixed and cannot be changed
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Total Price (Auto-calculated, read-only) - Hidden for Site Engineers and Project Managers */}
                            {!shouldHidePrices && (
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Total Amount
                                </label>
                                <input
                                  type="text"
                                  value={formatCurrency(material.total_price)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-blue-50 text-sm font-semibold text-blue-700"
                                  readOnly
                                  disabled
                                />
                              </div>
                            )}

                            {/* Reason */}
                            <div className="md:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                Reason <span className="text-red-500">*</span>
                              </label>
                              <textarea
                                value={material.reason}
                                onChange={(e) => handleMaterialChange(material.id, 'reason', e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="Why is this material needed?"
                                required
                                disabled={loading}
                              />
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Total Summary - Hidden for Site Engineers and Project Managers */}
                  {!shouldHidePrices && (
                    <div className="mb-6 p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold text-blue-900">Total Request Amount:</span>
                        <span className="text-2xl font-bold text-blue-600">
                          {formatCurrency(totalCost)}
                        </span>
                      </div>
                      <p className="text-xs text-blue-700 mt-2">
                        {materials.length} material{materials.length !== 1 ? 's' : ''} • Original: {formatCurrency(changeRequest.materials_total_cost || 0)} • Change: {formatCurrency(totalCost - (changeRequest.materials_total_cost || 0))}
                      </p>
                    </div>
                  )}

                  {/* Warning Message */}
                  <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-yellow-900">Important Notes:</p>
                        <ul className="text-xs text-yellow-800 mt-2 space-y-1 list-disc list-inside">
                          <li>Changes will reset the approval workflow based on the new miscellaneous percentage</li>
                          <li>Unit field is fixed and cannot be changed</li>
                          <li>Unit price from BOQ is fixed and cannot be changed for existing materials</li>
                          <li>Total amount is automatically calculated from quantity × unit price</li>
                          {isProjectManagerOrEstimator && <li>As a Project Manager or Estimator, you can edit quantities even for materials from the master list</li>}
                          <li>All approvers will need to review the updated request</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </form>
              </div>

              {/* Footer Actions */}
              <div className="flex-shrink-0 px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="edit-form"
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <>
                      <ModernLoadingSpinners size="sm" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Update PO</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (588 lines - CRITICAL)
export default React.memo(EditChangeRequestModal);
