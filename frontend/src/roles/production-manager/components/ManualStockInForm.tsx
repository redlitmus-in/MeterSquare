import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Package,
  Plus,
  FileText,
  CheckCircle,
  DollarSign,
  ChevronDown,
  X,
  ExternalLink,
  ChevronRight,
  Info,
} from 'lucide-react';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { inventoryService, InventoryMaterial, CustomUnit } from '../services/inventoryService';
import { showError, showWarning, showSuccess } from '@/utils/toastHelper';
import ConfirmationModal from '../components/ConfirmationModal';
import NewMaterialModal from './NewMaterialModal';

const isSafeUrl = (url: string) => /^https?:\/\//i.test(url);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PurchaseTransaction {
  inventory_material_id: number;
  transaction_type: 'PURCHASE';
  quantity: number;
  unit_price: number;
  total_amount: number;
  reference_number?: string;
  notes?: string;
  delivery_note_url?: string;
  driver_name?: string;
  vehicle_number?: string;
  per_unit_transport_fee?: number;
  transport_fee?: number;
  transport_notes?: string;
  delivery_batch_ref?: string;
}

interface RecentBatch {
  delivery_batch_ref: string;
  driver_name: string;
  vehicle_number: string;
  transport_fee: number;
  transport_notes: string;
  created_at: string;
  material_count: number;
  delivery_note_url?: string;
}

interface PrefillMaterial {
  material_name: string;
  brand?: string;
  size?: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  driver_name?: string;
  vehicle_number?: string;
  reference_number?: string;
  per_unit_transport_fee?: number;
}

interface PrefillData {
  materials: PrefillMaterial[];
}

interface ManualStockInFormProps {
  allMaterials: InventoryMaterial[];
  recentBatches: RecentBatch[];
  customUnits: CustomUnit[];
  purchaseTransactions: Array<{ delivery_batch_ref?: string }>;
  onSaveComplete: () => void;
  onClose: () => void;
  onMaterialCreated: (material: InventoryMaterial) => void;
  onCustomUnitCreated: (unit: CustomUnit) => void;
  prefillData?: PrefillData | null;
  /** When true, locks material selection to prefilled materials only (from inspection flow) */
  fromInspection?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ManualStockInForm: React.FC<ManualStockInFormProps> = ({
  allMaterials,
  recentBatches,
  customUnits,
  purchaseTransactions,
  onSaveComplete,
  onClose,
  onMaterialCreated,
  onCustomUnitCreated,
  prefillData,
  fromInspection = false,
}) => {
  // Index into prefillData.materials (kept for single-material fallback, unused in batch mode)
  const [prefillIndex, setPrefillIndex] = useState(0);

  // ── Batch prefill state (used when prefillData has ≥1 materials) ──
  // Editable rows mirroring prefillData.materials with resolved catalog IDs
  const [batchRows, setBatchRows] = useState<Array<{
    material_name: string;
    unit: string;
    quantity: number;
    unit_price: number;
    inventory_material_id: number;
    matched: boolean; // true = found in catalog
  }>>([]);
  const [batchDriver, setBatchDriver] = useState('');
  const [batchVehicle, setBatchVehicle] = useState('');
  const [batchReference, setBatchReference] = useState('');
  const [batchTransportFee, setBatchTransportFee] = useState(0);
  const [batchDeliveryNote, setBatchDeliveryNote] = useState<File | null>(null);
  const [savingBatch, setSavingBatch] = useState(false);
  const [batchConfirmModal, setBatchConfirmModal] = useState(false);

  // Initialise batch rows when prefillData + allMaterials are ready
  useEffect(() => {
    if (!prefillData || prefillData.materials.length === 0 || allMaterials.length === 0) return;
    const first = prefillData.materials[0];
    setBatchDriver(first.driver_name || '');
    setBatchVehicle(first.vehicle_number || '');
    setBatchReference(first.reference_number || '');
    setBatchTransportFee(first.per_unit_transport_fee ?? 0);
    setBatchRows(prefillData.materials.map((mat) => {
      const match = allMaterials.find(
        (m) => m.material_name?.toLowerCase().trim() === mat.material_name?.toLowerCase().trim()
      );
      return {
        material_name: mat.material_name,
        unit: mat.unit || match?.unit || 'pcs',
        quantity: mat.quantity,
        unit_price: mat.unit_price ?? match?.unit_price ?? 0,
        inventory_material_id: match?.inventory_material_id ?? 0,
        matched: !!match,
      };
    }));
  }, [prefillData, allMaterials]);

  const handleSaveBatch = async () => {
    const matched = batchRows.filter((r) => r.matched);
    if (matched.length === 0) {
      showWarning('No materials are in the inventory catalog. Add them first, then re-open stock-in.');
      return;
    }
    const invalid = matched.filter((r) => r.quantity <= 0 || r.unit_price <= 0);
    if (invalid.length > 0) {
      showWarning('All materials must have a valid quantity and unit price.');
      return;
    }
    if (!batchDeliveryNote) {
      showWarning('Please upload the delivery note from the vendor.');
      return;
    }

    setBatchConfirmModal(true);
  };

  const handleConfirmBatch = async () => {
    setBatchConfirmModal(false);
    setSavingBatch(true);
    const matched = batchRows.filter((r) => r.matched);
    try {
      // Generate a batch reference
      const existingBatchRefs = purchaseTransactions
        .map((t) => t.delivery_batch_ref)
        .filter((r): r is string => !!r && r.startsWith('MSQ-IN-'));
      const maxSeq = existingBatchRefs.reduce((max, ref) => {
        const m = ref.match(/MSQ-IN-(\d+)/);
        return m ? Math.max(max, parseInt(m[1])) : max;
      }, 0);
      const batchRef = `MSQ-IN-${String(maxSeq + 1).padStart(2, '0')}`;

      // Save only matched rows — first one carries the delivery note file
      for (let i = 0; i < matched.length; i++) {
        const row = matched[i];
        const txn: PurchaseTransaction = {
          inventory_material_id: row.inventory_material_id,
          transaction_type: 'PURCHASE',
          quantity: row.quantity,
          unit_price: row.unit_price,
          total_amount: row.quantity * row.unit_price,
          driver_name: batchDriver,
          vehicle_number: batchVehicle,
          reference_number: batchReference,
          per_unit_transport_fee: batchTransportFee,
          transport_fee: batchTransportFee * row.quantity,
          delivery_batch_ref: batchRef,
        };
        // Only first item uploads the file; subsequent ones send batchRef so backend links the note
        await inventoryService.createTransactionWithFile(txn, i === 0 ? batchDeliveryNote : null);
      }

      showSuccess(`Stock In recorded for ${matched.length} material${matched.length > 1 ? 's' : ''}!`);
      onSaveComplete();
    } catch (err) {
      console.error('Batch stock-in error:', err);
      showError('Failed to save batch stock-in. Please try again.');
    } finally {
      setSavingBatch(false);
    }
  };

  // Form state
  const [purchaseFormData, setPurchaseFormData] = useState<PurchaseTransaction>({
    inventory_material_id: 0,
    transaction_type: 'PURCHASE',
    quantity: 0,
    unit_price: 0,
    total_amount: 0,
    reference_number: '',
    notes: '',
    driver_name: '',
    vehicle_number: '',
    per_unit_transport_fee: 1,
    transport_fee: 0,
    transport_notes: '',
    delivery_batch_ref: '',
  });
  const [deliveryNoteFile, setDeliveryNoteFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Selected material
  const [selectedMaterial, setSelectedMaterial] = useState<InventoryMaterial | null>(null);

  // Material search combobox
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const materialDropdownRef = useRef<HTMLDivElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);

  // Batch reference info
  const [selectedBatchReference, setSelectedBatchReference] = useState<{
    original_fee: number;
    delivery_note_url?: string;
  } | null>(null);
  const [showBatchListModal, setShowBatchListModal] = useState(false);

  // New Material Modal
  const [showNewMaterialModal, setShowNewMaterialModal] = useState(false);

  // Confirmation modal
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Confirm',
  });

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    if (materialSearchTerm.trim() === '') return allMaterials;
    const search = materialSearchTerm.toLowerCase();
    return allMaterials.filter(
      (m) =>
        m.material_name?.toLowerCase().includes(search) ||
        m.material_code?.toLowerCase().includes(search) ||
        m.brand?.toLowerCase().includes(search),
    );
  }, [materialSearchTerm, allMaterials]);

  // Reset form fields (called when navigating between prefill materials)
  // When fromInspection=true, keeps transport/delivery details + file so PM doesn't re-enter them
  const resetForm = useCallback(() => {
    setSelectedMaterial(null);
    setMaterialSearchTerm('');
    setSelectedBatchReference(null);
    if (fromInspection) {
      // Keep delivery note file — same vendor note applies to all materials
      setPurchaseFormData((prev) => ({
        ...prev,
        inventory_material_id: 0,
        quantity: 0,
        unit_price: 0,
        total_amount: 0,
        notes: '',
      }));
    } else {
      setDeliveryNoteFile(null);
      setPurchaseFormData({
        inventory_material_id: 0,
        transaction_type: 'PURCHASE',
        quantity: 0,
        unit_price: 0,
        total_amount: 0,
        reference_number: '',
        notes: '',
        driver_name: '',
        vehicle_number: '',
        per_unit_transport_fee: 1,
        transport_fee: 0,
        transport_notes: '',
        delivery_batch_ref: '',
      });
    }
  }, [fromInspection]);

  // Apply current prefill material to the form whenever prefillIndex or allMaterials changes
  useEffect(() => {
    if (!prefillData || prefillData.materials.length === 0) return;
    const mat = prefillData.materials[prefillIndex];
    if (!mat) return;

    // Try to find matching material in catalog (case-insensitive name match)
    const match = allMaterials.find(
      (m) => m.material_name?.toLowerCase().trim() === mat.material_name?.toLowerCase().trim()
    );

    if (match) {
      setSelectedMaterial(match);
      setMaterialSearchTerm(
        `${match.material_code} - ${match.material_name}${match.brand ? ` (${match.brand})` : ''}`
      );
    } else {
      // Material not in catalog — pre-fill search term so PM can pick manually
      setSelectedMaterial(null);
      setMaterialSearchTerm(mat.material_name || '');
    }

    const unitPrice = mat.unit_price ?? match?.unit_price ?? 0;

    setPurchaseFormData((prev) => ({
      ...prev,
      inventory_material_id: match?.inventory_material_id || 0,
      quantity: mat.quantity,
      unit_price: unitPrice,
      total_amount: mat.quantity * unitPrice,
      // For transport/delivery: use prefill data if present, otherwise keep current form values
      // (so PM enters once on material 1, and it carries forward to material 2+)
      driver_name: mat.driver_name || prev.driver_name || '',
      vehicle_number: mat.vehicle_number || prev.vehicle_number || '',
      reference_number: mat.reference_number || prev.reference_number || '',
      per_unit_transport_fee: mat.per_unit_transport_fee ?? prev.per_unit_transport_fee ?? 0,
      transport_fee: (mat.per_unit_transport_fee ?? prev.per_unit_transport_fee ?? 0) * mat.quantity,
    }));

    // Don't clear delivery note file when advancing between inspection materials
    // — same vendor delivery note applies to all materials in the batch
    if (!fromInspection) {
      setDeliveryNoteFile(null);
    }
    setSelectedBatchReference(null);
  }, [prefillData, prefillIndex, allMaterials, fromInspection]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showMaterialDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (materialDropdownRef.current && !materialDropdownRef.current.contains(event.target as Node)) {
        setShowMaterialDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMaterialDropdown]);

  const handleMaterialSearchChange = (value: string) => {
    setMaterialSearchTerm(value);
    setShowMaterialDropdown(true);
    if (selectedMaterial && value !== `${selectedMaterial.material_code} - ${selectedMaterial.material_name}`) {
      setSelectedMaterial(null);
      setPurchaseFormData((prev) => ({ ...prev, inventory_material_id: 0, unit_price: 0 }));
    }
  };

  const handleSelectMaterialFromDropdown = (material: InventoryMaterial) => {
    setSelectedMaterial(material);
    setMaterialSearchTerm(
      `${material.material_code} - ${material.material_name}${material.brand ? ` (${material.brand})` : ''}`,
    );
    setPurchaseFormData((prev) => ({
      ...prev,
      inventory_material_id: material.inventory_material_id || 0,
      unit_price: material.unit_price || 0,
    }));
    setShowMaterialDropdown(false);
    if (materialInputRef.current) materialInputRef.current.blur();
  };

  const handleClearMaterialSelection = () => {
    setSelectedMaterial(null);
    setMaterialSearchTerm('');
    setPurchaseFormData((prev) => ({ ...prev, inventory_material_id: 0, unit_price: 0 }));
    materialInputRef.current?.focus();
  };

  const handleOpenNewMaterialModal = () => {
    setShowNewMaterialModal(true);
    setShowMaterialDropdown(false);
  };

  const handleQuantityChange = (quantity: number) => {
    const total = quantity * purchaseFormData.unit_price;
    setPurchaseFormData({ ...purchaseFormData, quantity, total_amount: total });
  };

  const handleUnitPriceChange = (unitPrice: number) => {
    const total = purchaseFormData.quantity * unitPrice;
    setPurchaseFormData({ ...purchaseFormData, unit_price: unitPrice, total_amount: total });
  };

  const handlePerUnitTransportFeeChange = (totalFee: number) => {
    const perUnitFee = purchaseFormData.quantity > 0 ? totalFee / purchaseFormData.quantity : 0;
    setPurchaseFormData({
      ...purchaseFormData,
      per_unit_transport_fee: perUnitFee,
      transport_fee: totalFee,
    });
  };

  const formatCurrency = (amount: number) => `AED ${amount.toFixed(2)}`;

  const handleSavePurchase = async () => {
    try {
      if (!purchaseFormData.inventory_material_id) {
        showWarning('Please select a material');
        return;
      }
      if (purchaseFormData.quantity <= 0) {
        showWarning('Please enter a valid quantity');
        return;
      }
      if (purchaseFormData.unit_price <= 0) {
        showWarning('Please enter a valid unit price');
        return;
      }
      if (!deliveryNoteFile && !selectedBatchReference?.delivery_note_url) {
        showWarning('Please upload a delivery note from vendor');
        return;
      }

      let finalBatchRef = purchaseFormData.delivery_batch_ref;

      const hasTransportFeeChange =
        selectedBatchReference &&
        purchaseFormData.transport_fee !== 0 &&
        purchaseFormData.transport_fee !== selectedBatchReference.original_fee;

      if (finalBatchRef && hasTransportFeeChange) {
        finalBatchRef = '';
      }

      if (!finalBatchRef && (purchaseFormData.driver_name || purchaseFormData.vehicle_number)) {
        const existingBatchRefs = purchaseTransactions
          .map((txn) => txn.delivery_batch_ref)
          .filter((ref): ref is string => !!ref && ref.startsWith('MSQ-IN-'));

        const sequenceNumbers = existingBatchRefs.map((ref) => {
          const match = ref.match(/MSQ-IN-(\d+)/);
          return match ? parseInt(match[1]) : 0;
        });

        const nextSequence = sequenceNumbers.length > 0 ? Math.max(...sequenceNumbers) + 1 : 1;
        finalBatchRef = `MSQ-IN-${String(nextSequence).padStart(2, '0')}`;
      }

      const transactionToSave = {
        ...purchaseFormData,
        delivery_batch_ref: finalBatchRef,
        delivery_note_url:
          !deliveryNoteFile && selectedBatchReference?.delivery_note_url
            ? selectedBatchReference.delivery_note_url
            : undefined,
      };

      setConfirmModal({
        show: true,
        title: 'Confirm Stock In',
        message: `Are you sure you want to receive ${purchaseFormData.quantity} ${selectedMaterial?.unit} of ${selectedMaterial?.material_name}? This will add stock to inventory.`,
        onConfirm: async () => {
          setSaving(true);
          try {
            await inventoryService.createTransactionWithFile(transactionToSave, deliveryNoteFile);

            const totalPrefill = prefillData?.materials.length ?? 0;
            const nextIndex = prefillIndex + 1;

            if (totalPrefill > 0 && nextIndex < totalPrefill) {
              // More prefill materials to record — clear stale state then advance to next
              showSuccess(
                `Stock In recorded! (${nextIndex} of ${totalPrefill} done) — loading next material...`
              );
              resetForm();
              setPrefillIndex(nextIndex);
            } else {
              showSuccess('Stock In recorded successfully!');
              setDeliveryNoteFile(null);
              onSaveComplete();
            }
          } catch (error) {
            console.error('Error creating purchase transaction:', error);
            showError('Failed to record Stock In. Please try again.');
          } finally {
            setSaving(false);
            setConfirmModal((prev) => ({ ...prev, show: false }));
          }
        },
        confirmText: 'Confirm',
      });
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const totalPrefill = prefillData?.materials.length ?? 0;
  // Always use the regular single-material form — no batch mode
  const isPrefillMode = false;

  // ── BATCH MODE (disabled — kept for reference) ──
  if (isPrefillMode) {
    const matchedRows = batchRows.filter(r => r.matched);
    const unmatchedRows = batchRows.filter(r => !r.matched);
    const batchTotal = matchedRows.reduce((sum, r) => sum + r.quantity * r.unit_price, 0);
    const allUnmatched = matchedRows.length === 0;

    return (
      <>
        <div className="p-6 space-y-5">
          {/* Header info */}
          <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800">
                Pre-filled from inspection — {batchRows.length} material{batchRows.length !== 1 ? 's' : ''} accepted
              </p>
              <p className="text-xs text-blue-600 mt-0.5">
                Review quantities and prices, enter delivery details, upload the vendor's delivery note, then confirm all at once.
              </p>
            </div>
          </div>

          {/* Materials NOT in catalog — shown as a warning, excluded from stock-in */}
          {unmatchedRows.length > 0 && (
            <div className="border border-amber-200 rounded-xl overflow-hidden">
              <div className="bg-amber-50 px-4 py-2.5 border-b border-amber-200 flex items-center gap-2">
                <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Not in Inventory Catalog</span>
                <span className="ml-auto text-xs text-amber-600">Add these via "Add Material" first, then re-open stock-in</span>
              </div>
              <div className="divide-y divide-amber-100">
                {unmatchedRows.map((row, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between bg-white">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{row.material_name}</p>
                      <p className="text-xs text-gray-400">{row.unit} · {row.quantity} accepted</p>
                    </div>
                    <span className="text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">Not in catalog</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materials ready to stock-in */}
          {matchedRows.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {unmatchedRows.length > 0 && (
                <div className="bg-green-50 px-4 py-2 border-b border-gray-200">
                  <span className="text-xs font-semibold text-green-800 uppercase tracking-wide">Ready for Stock-In</span>
                </div>
              )}
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase">Material</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase w-28">Qty</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase w-32">Unit Price (AED)</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase w-28">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {batchRows.map((row, i) => !row.matched ? null : (
                    <tr key={i} className="bg-white">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{row.material_name}</p>
                        <p className="text-xs text-gray-400">{row.unit}</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number" min={0.01} step="any"
                          value={row.quantity || ''}
                          onChange={(e) => setBatchRows(prev => prev.map((r, idx) =>
                            idx !== i ? r : { ...r, quantity: parseFloat(e.target.value) || 0 }
                          ))}
                          className="w-24 text-center border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-green-500"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="number" min={0} step="0.01"
                          value={row.unit_price || ''}
                          onChange={(e) => setBatchRows(prev => prev.map((r, idx) =>
                            idx !== i ? r : { ...r, unit_price: parseFloat(e.target.value) || 0 }
                          ))}
                          className="w-28 text-center border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-green-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-800">
                        AED {(row.quantity * row.unit_price).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={3} className="px-4 py-2.5 text-sm font-semibold text-gray-700 text-right">Grand Total</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">AED {batchTotal.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Delivery details + upload — only shown when there are matched materials to save */}
          {allUnmatched && (
            <div className="text-center py-4 text-sm text-gray-500">
              Add the missing materials to the inventory catalog first, then re-open stock-in from the inspection.
            </div>
          )}

          {/* Shared delivery details */}
          {!allUnmatched && <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Driver Name</label>
              <input type="text" value={batchDriver} onChange={(e) => setBatchDriver(e.target.value)}
                placeholder="Driver name" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Vehicle Number</label>
              <input type="text" value={batchVehicle} onChange={(e) => setBatchVehicle(e.target.value)}
                placeholder="Vehicle number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Reference / PO Number</label>
              <input type="text" value={batchReference} onChange={(e) => setBatchReference(e.target.value)}
                placeholder="PO / invoice ref" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
            </div>
          </div>}

          {!allUnmatched && <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Transport Fee per Unit (AED)</label>
            <input type="number" min={0} step="0.01" value={batchTransportFee || ''}
              onChange={(e) => setBatchTransportFee(parseFloat(e.target.value) || 0)}
              placeholder="0.00" className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500" />
          </div>}

          {/* Delivery note upload */}
          {!allUnmatched && <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FileText className="w-4 h-4 inline mr-1" />
              Delivery Note from Vendor <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 10 * 1024 * 1024) { alert('Max 10MB'); e.target.value = ''; return; }
                  setBatchDeliveryNote(file);
                }
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
            />
            {batchDeliveryNote && (
              <div className="mt-2 flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700 font-medium">{batchDeliveryNote.name}</span>
                </div>
                <button type="button" onClick={() => setBatchDeliveryNote(null)} className="text-red-500 hover:text-red-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} disabled={savingBatch}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors">
            Close
          </button>
          {!allUnmatched && (
            <button onClick={handleSaveBatch} disabled={savingBatch}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">
              {savingBatch ? (
                <><ModernLoadingSpinners size="xxs" /><span>Saving...</span></>
              ) : (
                <><CheckCircle className="w-5 h-5" /><span>Confirm Stock In ({matchedRows.length} material{matchedRows.length !== 1 ? 's' : ''})</span></>
              )}
            </button>
          )}
        </div>

        {/* Batch confirm modal */}
        {batchConfirmModal && (
          <ConfirmationModal
            show={batchConfirmModal}
            title="Confirm Batch Stock In"
            message={`Record stock-in for ${matchedRows.length} material${matchedRows.length > 1 ? 's' : ''}? Total: AED ${batchTotal.toFixed(2)}. This will add all accepted quantities to inventory.`}
            onConfirm={handleConfirmBatch}
            onCancel={() => setBatchConfirmModal(false)}
            confirmText="Confirm All"
            confirmColor="APPROVE"
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="p-6 space-y-6">

        {/* Inspection prefill progress indicator */}
        {fromInspection && totalPrefill > 1 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800">
                Material {prefillIndex + 1} of {totalPrefill}
              </p>
              <p className="text-xs text-blue-600 mt-0.5">
                Complete each material&apos;s stock-in. The next material will load automatically after saving.
              </p>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: totalPrefill }).map((_, i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full ${
                    i < prefillIndex ? 'bg-green-500' : i === prefillIndex ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Material Selection - Searchable Combobox */}
        <div ref={materialDropdownRef} className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Package className="w-4 h-4 inline mr-1" />
            Material *
          </label>

          {/* When from inspection: show locked material (no dropdown, no search) */}
          {fromInspection ? (
            <div className={`w-full px-4 py-2 rounded-lg border border-gray-300 ${
              selectedMaterial ? 'bg-green-50' : 'bg-gray-50'
            }`}>
              <span className="font-medium text-gray-900">
                {selectedMaterial
                  ? `${selectedMaterial.material_code} - ${selectedMaterial.material_name}${selectedMaterial.brand ? ` (${selectedMaterial.brand})` : ''}`
                  : materialSearchTerm || 'Loading...'}
              </span>
              {!selectedMaterial && materialSearchTerm && (
                <p className="text-xs text-amber-600 mt-1">
                  Not found in inventory catalog — add it below
                </p>
              )}
            </div>
          ) : (
            /* Normal mode: searchable dropdown */
            <div className="relative">
              <input
                ref={materialInputRef}
                type="text"
                value={materialSearchTerm}
                onChange={(e) => handleMaterialSearchChange(e.target.value)}
                onFocus={() => {
                  if (!selectedMaterial) setShowMaterialDropdown(true);
                }}
                onClick={(e) => {
                  if (selectedMaterial) e.currentTarget.blur();
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
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${showMaterialDropdown ? 'rotate-180' : ''}`}
                    />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* When from inspection and material not matched: small inline add link */}
          {fromInspection && !selectedMaterial && materialSearchTerm && (
            <button
              type="button"
              onClick={handleOpenNewMaterialModal}
              className="mt-2 text-xs text-green-700 bg-green-50 hover:bg-green-100 font-medium inline-flex items-center gap-1 px-3 py-1.5 border-2 border-green-500 rounded-lg transition-colors"
            >
              <Plus className="w-3 h-3" />
              Not in catalog? Add &quot;{materialSearchTerm}&quot; as new material
            </button>
          )}

          {/* Dropdown List — only for manual mode */}
          {!fromInspection && showMaterialDropdown && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {filteredMaterials.length === 0 && materialSearchTerm.trim() === '' ? (
                <div className="px-4 py-3 text-gray-500 text-sm">Type to search materials...</div>
              ) : (
                <>
                  {filteredMaterials.map((material) => (
                    <button
                      key={material.inventory_material_id}
                      type="button"
                      onClick={() => handleSelectMaterialFromDropdown(material)}
                      className={`w-full px-4 py-2 text-left hover:bg-gray-100 flex flex-col ${
                        selectedMaterial?.inventory_material_id === material.inventory_material_id
                          ? 'bg-green-50'
                          : ''
                      }`}
                    >
                      <span className="font-medium text-gray-900">
                        {material.material_code} - {material.material_name}
                      </span>
                      {material.brand && <span className="text-sm text-gray-500">{material.brand}</span>}
                    </button>
                  ))}
                  {materialSearchTerm.trim() !== '' && (
                    <button
                      type="button"
                      onClick={handleOpenNewMaterialModal}
                      className="w-full px-4 py-3 text-left hover:bg-green-50 border-t border-gray-200 flex items-center space-x-2 text-green-600 font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Create New Material: &quot;{materialSearchTerm}&quot;</span>
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
                <span className="ml-2 font-medium">
                  {selectedMaterial.current_stock} {selectedMaterial.unit}
                </span>
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
          <label className="block text-sm font-medium text-gray-700 mb-2">Quantity Received *</label>
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
          {selectedMaterial && <p className="text-xs text-gray-500 mt-1">Unit: {selectedMaterial.unit}</p>}
        </div>

        {/* Unit Price */}
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
          <p className="text-xs text-gray-500 mt-1">Enter the actual price paid to vendor for this purchase</p>
        </div>

        {/* Total Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Total Amount (AED)</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
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
              <svg
                className="w-5 h-5 mr-2 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
                />
              </svg>
              Transport &amp; Delivery Details
            </h3>
            {recentBatches.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBatchListModal(true)}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm flex items-center space-x-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
                </svg>
                <span>Recent Deliveries</span>
              </button>
            )}
          </div>

          {recentBatches.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-blue-800">
                  <strong>Last Delivery:</strong> {recentBatches[0].driver_name} &bull;{' '}
                  {recentBatches[0].vehicle_number}
                  {recentBatches[0].delivery_batch_ref && (
                    <span className="ml-2 px-2 py-0.5 bg-blue-100 rounded text-xs font-mono">
                      {recentBatches[0].delivery_batch_ref}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const mostRecentBatch = recentBatches[0];
                    if (mostRecentBatch) {
                      setSelectedBatchReference({
                        original_fee: mostRecentBatch.transport_fee || 0,
                        delivery_note_url: mostRecentBatch.delivery_note_url,
                      });
                      setPurchaseFormData((prev) => ({
                        ...prev,
                        driver_name: mostRecentBatch.driver_name,
                        vehicle_number: mostRecentBatch.vehicle_number,
                        per_unit_transport_fee: 0,
                        transport_fee: 0,
                        transport_notes: mostRecentBatch.transport_notes,
                        delivery_batch_ref: mostRecentBatch.delivery_batch_ref,
                      }));
                    }
                  }}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center space-x-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  <span>Last Delivery</span>
                </button>
              </div>
              <p className="text-xs text-blue-600 mt-2">
                Materials from the same delivery will share the batch reference and transport details. Only the
                first material should have the transport fee.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Driver Name</label>
              <input
                type="text"
                value={purchaseFormData.driver_name || ''}
                onChange={(e) => setPurchaseFormData({ ...purchaseFormData, driver_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Enter driver name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Number</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-3">Transport Fee Calculation</label>

            {selectedBatchReference && selectedBatchReference.original_fee > 0 && (
              <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-amber-800 font-medium text-sm">
                  Reference: Original transport fee for this batch was:{' '}
                  <span className="font-bold">AED {selectedBatchReference.original_fee.toFixed(2)}</span>
                </p>
                <p className="text-amber-700 text-xs mt-2">
                  You can edit the per-unit fee below if there was an additional charge for this specific material.
                </p>
              </div>
            )}

            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter total transport fee{' '}
                <span className="text-xs text-gray-500 font-normal">(Default: 1.00 AED per unit)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={purchaseFormData.transport_fee === 0 ? '' : purchaseFormData.transport_fee}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    handlePerUnitTransportFeeChange(0);
                  } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) handlePerUnitTransportFeeChange(numValue);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1.5 flex items-start">
                <svg
                  className="w-4 h-4 text-gray-400 mr-1 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                This is the total transport cost paid for material delivered.
              </p>
            </div>

            {(purchaseFormData.transport_fee ?? 0) > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <svg
                      className="w-5 h-5 text-blue-600 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-sm text-blue-900 font-semibold">Total Transport Fee:</span>
                  </div>
                  <span className="text-2xl font-bold text-blue-900">
                    AED {(purchaseFormData.transport_fee || 0).toFixed(2)}
                  </span>
                </div>
                <div className="bg-white rounded-md p-2 border border-blue-200">
                  <p className="text-xs text-blue-800 font-medium">
                    Calculation: 1 x {(purchaseFormData.transport_fee || 0).toFixed(2)} ={' '}
                    <span className="font-bold">{(purchaseFormData.transport_fee || 0).toFixed(2)} AED</span>
                  </p>
                </div>
              </div>
            )}

            {!purchaseFormData.quantity && (
              <p className="text-xs text-gray-500 italic mt-2">
                Total transport fee will be calculated automatically when you enter the quantity
              </p>
            )}
          </div>
        </div>

        {/* Delivery Note Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <FileText className="w-4 h-4 inline mr-1" />
            Delivery Note from Vendor <span className="text-red-500">*</span>
          </label>

          {selectedBatchReference && !deliveryNoteFile ? (
            selectedBatchReference.delivery_note_url ? (
              <div className="mb-3 bg-green-50 border-2 border-green-300 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-green-800 font-semibold mb-2 text-sm">
                      Delivery Note Available from Batch
                    </p>
                    {isSafeUrl(selectedBatchReference.delivery_note_url) && (
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
                    )}
                    <p className="text-green-700 text-xs leading-relaxed">
                      This material will use the delivery note from the selected batch. You can upload a different
                      file below if this specific material has a separate delivery note.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-3 bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <svg
                      className="w-6 h-6 text-orange-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-orange-800 font-semibold mb-2 text-sm">
                      No Delivery Note in Selected Batch
                    </p>
                    <p className="text-orange-700 text-xs leading-relaxed mb-2">
                      The first material from this batch ({purchaseFormData.delivery_batch_ref}) was received
                      without uploading a delivery note. You must upload a delivery note for this material.
                    </p>
                    <p className="text-orange-600 text-xs font-medium">
                      Please upload the delivery note below before proceeding.
                    </p>
                  </div>
                </div>
              </div>
            )
          ) : null}

          <div>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
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

      {/* Footer */}
      <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
        <button
          onClick={onClose}
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

      {/* Confirmation Modal */}
      {confirmModal.show && (
        <ConfirmationModal
          show={confirmModal.show}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal((prev) => ({ ...prev, show: false }))}
          confirmText={confirmModal.confirmText}
          confirmColor="APPROVE"
        />
      )}

      {/* Recent Delivery Batches Modal */}
      {showBatchListModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center">
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                  />
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

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-180px)]">
              <p className="text-sm text-gray-600 mb-4">
                Select a recent delivery to copy transport and driver details to the form.
              </p>
              <div className="space-y-3">
                {recentBatches.map((batch) => (
                  <div
                    key={batch.delivery_batch_ref}
                    onClick={() => {
                      setSelectedBatchReference({
                        original_fee: batch.transport_fee || 0,
                        delivery_note_url: batch.delivery_note_url,
                      });
                      setPurchaseFormData((prev) => ({
                        ...prev,
                        driver_name: batch.driver_name,
                        vehicle_number: batch.vehicle_number,
                        per_unit_transport_fee: 0,
                        transport_fee: 0,
                        transport_notes: batch.transport_notes,
                        delivery_batch_ref: batch.delivery_batch_ref,
                      }));
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
                            <span className="ml-2 font-medium text-gray-900">
                              {batch.vehicle_number || 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">Transport Fee:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              AED {batch.transport_fee?.toFixed(2) || '0.00'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">Date:</span>
                            <span className="ml-2 font-medium text-gray-900">
                              {new Date(batch.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
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

      {/* New Material Modal */}
      <NewMaterialModal
        isOpen={showNewMaterialModal}
        onClose={() => setShowNewMaterialModal(false)}
        customUnits={customUnits}
        onMaterialCreated={(material) => {
          onMaterialCreated(material);
          handleSelectMaterialFromDropdown(material);
          setShowNewMaterialModal(false);
        }}
        onCustomUnitCreated={onCustomUnitCreated}
        defaultMaterialName={materialSearchTerm}
      />
    </>
  );
};

export default ManualStockInForm;
