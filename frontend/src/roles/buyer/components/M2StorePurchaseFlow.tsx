import React, { useState, useEffect } from 'react';
import M2AvailabilityCard, { calculateM2Availability } from './M2AvailabilityCard';
import { Loader, CheckCircle } from 'lucide-react';

interface Material {
  materialId: number;
  materialName: string;
  brand?: string;
  size?: string;
  requestedQty: number;
  unit: string;
  master_material_id?: number;
}

interface M2StorePurchaseFlowProps {
  changeRequestId: string;
  materials: Material[];
  onM2OnlyConfirmed?: (allocation: any) => void;
  onSplitProcurement?: (m2Allocation: any, vendorNeeded: any) => void;
  onVendorOnlyProceed?: (materials: any) => void;
  onCancel?: () => void;
}

/**
 * M2StorePurchaseFlow Component
 *
 * This component orchestrates the M2 Store availability check before vendor selection.
 * It implements the priority logic:
 * 1. Check M2 Store availability first
 * 2. If 100% available → Auto-allocate from M2, no vendor needed
 * 3. If partial → Split allocation (M2 + vendor)
 * 4. If 0% → Traditional vendor selection only
 *
 * Usage:
 * This component should be shown when buyer is processing a change request
 * and needs to select vendors/sources for materials.
 */
const M2StorePurchaseFlow: React.FC<M2StorePurchaseFlowProps> = ({
  changeRequestId,
  materials,
  onM2OnlyConfirmed,
  onSplitProcurement,
  onVendorOnlyProceed,
  onCancel
}) => {
  const [isChecking, setIsChecking] = useState(true);
  const [materialsWithAvailability, setMaterialsWithAvailability] = useState<any[]>([]);

  // Simulate API call to check M2 Store availability
  useEffect(() => {
    checkM2Availability();
  }, [materials]);

  const checkM2Availability = async () => {
    setIsChecking(true);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock M2 Store inventory (in real implementation, this would be an API call)
    const mockM2Inventory: Record<number, { available: number; binLocation: string }> = {
      1: { available: 450, binLocation: 'Rack A-12' }, // Cement PPC 43
      2: { available: 0, binLocation: 'Rack B-05' },   // Steel Rebar 12mm
      3: { available: 0, binLocation: 'Rack C-03' },   // Paint Enamel
      4: { available: 45, binLocation: 'Rack A-15' },  // Cement OPC
      5: { available: 15000, binLocation: 'Section C' }, // Bricks
      6: { available: 0.5, binLocation: 'Yard-01' },   // Sand
      7: { available: 850, binLocation: 'Rack D-08' }, // Tiles
      8: { available: 120, binLocation: 'Rack E-02' }, // PVC Pipes
      9: { available: 2500, binLocation: 'Rack F-01' }, // Electrical Wire
      10: { available: 35, binLocation: 'Rack G-05' }  // Plywood
    };

    // Calculate availability for each material
    const withAvailability = materials.map(material => {
      const m2Stock = mockM2Inventory[material.materialId] || { available: 0, binLocation: '' };
      const availability = calculateM2Availability(material.requestedQty, m2Stock.available);

      return {
        ...material,
        ...availability,
        binLocation: m2Stock.binLocation
      };
    });

    setMaterialsWithAvailability(withAvailability);
    setIsChecking(false);
  };

  const handleM2OnlyConfirmed = () => {
    // All materials from M2 Store
    const allocation = {
      changeRequestId,
      source: 'M2_STORE_ONLY',
      materials: materialsWithAvailability.map(m => ({
        materialId: m.materialId,
        materialName: m.materialName,
        quantity: m.requestedQty,
        unit: m.unit,
        source: 'M2_STORE',
        binLocation: m.binLocation
      }))
    };

    onM2OnlyConfirmed?.(allocation);
  };

  const handleSplitProcurement = () => {
    // Split between M2 Store and vendors
    const m2Allocation = {
      changeRequestId,
      source: 'M2_STORE',
      materials: materialsWithAvailability
        .filter(m => m.m2AvailableQty > 0)
        .map(m => ({
          materialId: m.materialId,
          materialName: m.materialName,
          quantity: m.m2AvailableQty,
          unit: m.unit,
          source: 'M2_STORE',
          binLocation: m.binLocation
        }))
    };

    const vendorNeeded = {
      changeRequestId,
      materials: materialsWithAvailability
        .filter(m => m.vendorNeededQty > 0)
        .map(m => ({
          materialId: m.materialId,
          materialName: m.materialName,
          brand: m.brand,
          size: m.size,
          quantity: m.vendorNeededQty,
          unit: m.unit,
          originalRequestQty: m.requestedQty,
          m2AllocatedQty: m.m2AvailableQty
        }))
    };


    onSplitProcurement?.(m2Allocation, vendorNeeded);
  };

  const handleVendorOnlyProceed = () => {
    // All materials from vendors
    const vendorMaterials = materialsWithAvailability.map(m => ({
      materialId: m.materialId,
      materialName: m.materialName,
      brand: m.brand,
      size: m.size,
      quantity: m.requestedQty,
      unit: m.unit
    }));

    onVendorOnlyProceed?.(vendorMaterials);
  };

  if (isChecking) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Checking M2 Store Availability...
          </h3>
          <p className="text-sm text-gray-600">
            Checking internal inventory for requested materials
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Change Request Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Purchase Materials</h2>
            <p className="text-sm text-gray-600 mt-1">
              Change Request: <span className="font-medium">{changeRequestId}</span> • {materials.length} material{materials.length !== 1 ? 's' : ''}
            </p>
          </div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* M2 Availability Card */}
      <M2AvailabilityCard
        materials={materialsWithAvailability}
        onConfirmM2Only={handleM2OnlyConfirmed}
        onProceedWithSplit={handleSplitProcurement}
        onProceedVendorOnly={handleVendorOnlyProceed}
      />

      {/* Info Section */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">How M2 Store Priority Works</h4>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Priority Check:</strong> M2 Store (internal inventory) is automatically checked first for all materials
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Cost Optimization:</strong> Using M2 Store reduces procurement costs and delivery time
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Auto-Allocation:</strong> Available quantities are automatically allocated from M2 Store
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Hybrid Approach:</strong> If partially available, the system splits procurement between M2 Store and vendors
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default M2StorePurchaseFlow;

/**
 * Integration Guide:
 *
 * 1. In your buyer change request flow, replace or wrap VendorSelectionModal with M2StorePurchaseFlow
 *
 * 2. Example usage:
 *
 * ```tsx
 * const [showPurchaseFlow, setShowPurchaseFlow] = useState(false);
 *
 * <M2StorePurchaseFlow
 *   changeRequestId="PO-2025-001"
 *   materials={[
 *     {
 *       materialId: 1,
 *       materialName: "Cement PPC 43",
 *       brand: "UltraTech",
 *       size: "50 kg",
 *       requestedQty: 100,
 *       unit: "bags"
 *     }
 *   ]}
 *   onM2OnlyConfirmed={(allocation) => {
 *     // Handle M2-only allocation
 *     // Skip vendor selection, mark change request as approved
 *     // Production Manager will receive dispatch request
 *   }}
 *   onSplitProcurement={(m2Allocation, vendorNeeded) => {
 *     // Handle split procurement
 *     // M2 allocation is auto-confirmed
 *     // Show vendor selection ONLY for vendorNeeded materials
 *   }}
 *   onVendorOnlyProceed={(materials) => {
 *     // Handle vendor-only procurement
 *     // Show traditional vendor selection modal
 *   }}
 *   onCancel={() => setShowPurchaseFlow(false)}
 * />
 * ```
 *
 * 3. Backend API endpoints needed:
 * - GET /api/m2-store/check-availability (check M2 stock for materials)
 * - POST /api/m2-store/allocate (allocate materials from M2 Store)
 * - POST /api/m2-store/dispatch-request (create dispatch request for Production Manager)
 */
