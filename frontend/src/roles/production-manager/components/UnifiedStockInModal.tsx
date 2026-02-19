import React from 'react';
import { ArrowDownCircle, X } from 'lucide-react';
import { InventoryMaterial, CustomUnit } from '../services/inventoryService';
import ManualStockInForm from './ManualStockInForm';

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

export interface PrefillMaterial {
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

export interface PrefillData {
  materials: PrefillMaterial[];
}

interface UnifiedStockInModalProps {
  isOpen: boolean;
  onClose: () => void;
  allMaterials: InventoryMaterial[];
  recentBatches: RecentBatch[];
  customUnits: CustomUnit[];
  purchaseTransactions: Array<{ delivery_batch_ref?: string }>;
  onSaveComplete: () => void;
  onMaterialCreated: (material: InventoryMaterial) => void;
  onCustomUnitCreated: (unit: CustomUnit) => void;
  prefillData?: PrefillData | null;
  /** When true, locks material selection to prefilled materials only (inspection flow) */
  fromInspection?: boolean;
}

const UnifiedStockInModal: React.FC<UnifiedStockInModalProps> = ({
  isOpen,
  onClose,
  allMaterials,
  recentBatches,
  customUnits,
  purchaseTransactions,
  onSaveComplete,
  onMaterialCreated,
  onCustomUnitCreated,
  prefillData,
  fromInspection = false,
}) => {
  if (!isOpen) return null;

  const isPrefill = prefillData && prefillData.materials.length > 0;
  const totalMaterials = prefillData?.materials.length ?? 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-100">
              <ArrowDownCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Record Stock In</h2>
              {isPrefill ? (
                <p className="text-xs text-blue-600 font-medium">
                  From inspection · {totalMaterials} material{totalMaterials !== 1 ? 's' : ''} to record
                </p>
              ) : (
                <p className="text-xs text-gray-500">Manual entry for individual materials</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-lg hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <ManualStockInForm
            allMaterials={allMaterials}
            recentBatches={recentBatches}
            customUnits={customUnits}
            purchaseTransactions={purchaseTransactions}
            onSaveComplete={onSaveComplete}
            onClose={onClose}
            onMaterialCreated={onMaterialCreated}
            onCustomUnitCreated={onCustomUnitCreated}
            prefillData={prefillData}
            fromInspection={fromInspection}
          />
        </div>
      </div>
    </div>
  );
};

export default UnifiedStockInModal;
