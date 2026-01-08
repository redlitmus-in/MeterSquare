import React from 'react';
import { Package, CheckCircle, AlertCircle, TrendingUp, Truck, Store } from 'lucide-react';

interface MaterialAvailability {
  materialId: number;
  materialName: string;
  brand?: string;
  size?: string;
  requestedQty: number;
  unit: string;
  m2AvailableQty: number;
  vendorNeededQty: number;
  availabilityPercentage: number;
  binLocation?: string;
}

interface M2AvailabilityCardProps {
  materials: MaterialAvailability[];
  onConfirmM2Only?: () => void;
  onProceedWithSplit?: () => void;
  onProceedVendorOnly?: () => void;
}

type AvailabilityStatus = 'full' | 'partial' | 'none';

const M2AvailabilityCard: React.FC<M2AvailabilityCardProps> = ({
  materials,
  onConfirmM2Only,
  onProceedWithSplit,
  onProceedVendorOnly
}) => {
  // Determine overall availability status
  const getOverallStatus = (): AvailabilityStatus => {
    const allFull = materials.every(m => m.availabilityPercentage === 100);
    const allZero = materials.every(m => m.availabilityPercentage === 0);

    if (allFull) return 'full';
    if (allZero) return 'none';
    return 'partial';
  };

  const overallStatus = getOverallStatus();

  const statusConfig = {
    full: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      icon: CheckCircle,
      iconColor: 'text-green-600',
      title: 'Available in M2 Store',
      subtitle: 'All materials available in internal inventory',
      badgeColor: 'bg-green-100 text-green-800'
    },
    partial: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      icon: AlertCircle,
      iconColor: 'text-yellow-600',
      title: 'Partial M2 Availability',
      subtitle: 'Some materials available in M2, vendors needed for remaining',
      badgeColor: 'bg-yellow-100 text-yellow-800'
    },
    none: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      icon: Truck,
      iconColor: 'text-blue-600',
      title: 'Vendor Purchase Required',
      subtitle: 'Materials not available in M2 Store, proceed with vendor selection',
      badgeColor: 'bg-blue-100 text-blue-800'
    }
  };

  const config = statusConfig[overallStatus];
  const StatusIcon = config.icon;

  return (
    <div className={`rounded-lg border-2 ${config.border} ${config.bg} overflow-hidden`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${config.bg}`}>
              <StatusIcon className={`w-6 h-6 ${config.iconColor}`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{config.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{config.subtitle}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.badgeColor}`}>
            {overallStatus === 'full' && '100% M2 Store'}
            {overallStatus === 'partial' && 'M2 + Vendor'}
            {overallStatus === 'none' && 'Vendor Only'}
          </span>
        </div>
      </div>

      {/* Materials List */}
      <div className="p-6 space-y-4">
        {materials.map((material, index) => {
          const isFullyAvailable = material.availabilityPercentage === 100;
          const isPartiallyAvailable = material.availabilityPercentage > 0 && material.availabilityPercentage < 100;
          const isNotAvailable = material.availabilityPercentage === 0;

          return (
            <div
              key={index}
              className="p-4 bg-white border border-gray-200 rounded-lg"
            >
              {/* Material Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{material.materialName}</h4>
                  {(material.brand || material.size) && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {material.brand} {material.size && `• ${material.size}`}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    Requested: {material.requestedQty} {material.unit}
                  </p>
                </div>
              </div>

              {/* Availability Progress Bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span>M2 Store Availability</span>
                  <span className="font-semibold">{material.availabilityPercentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 transition-all ${
                      isFullyAvailable
                        ? 'bg-green-500'
                        : isPartiallyAvailable
                        ? 'bg-yellow-500'
                        : 'bg-gray-400'
                    }`}
                    style={{ width: `${material.availabilityPercentage}%` }}
                  />
                </div>
              </div>

              {/* Source Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                {/* M2 Store Portion */}
                <div className={`p-3 rounded-lg border-2 ${
                  material.m2AvailableQty > 0
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Store className={`w-4 h-4 ${
                      material.m2AvailableQty > 0 ? 'text-green-600' : 'text-gray-400'
                    }`} />
                    <span className="text-xs font-medium text-gray-600">M2 Store</span>
                  </div>
                  <p className={`text-lg font-bold ${
                    material.m2AvailableQty > 0 ? 'text-green-700' : 'text-gray-400'
                  }`}>
                    {material.m2AvailableQty} {material.unit}
                  </p>
                  {material.binLocation && material.m2AvailableQty > 0 && (
                    <p className="text-xs text-green-600 mt-1">
                      From: {material.binLocation}
                    </p>
                  )}
                  {material.m2AvailableQty === 0 && (
                    <p className="text-xs text-gray-500 mt-1">Not available</p>
                  )}
                </div>

                {/* Vendor Portion */}
                <div className={`p-3 rounded-lg border-2 ${
                  material.vendorNeededQty > 0
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Truck className={`w-4 h-4 ${
                      material.vendorNeededQty > 0 ? 'text-blue-600' : 'text-gray-400'
                    }`} />
                    <span className="text-xs font-medium text-gray-600">Vendor</span>
                  </div>
                  <p className={`text-lg font-bold ${
                    material.vendorNeededQty > 0 ? 'text-blue-700' : 'text-gray-400'
                  }`}>
                    {material.vendorNeededQty} {material.unit}
                  </p>
                  {material.vendorNeededQty > 0 && (
                    <p className="text-xs text-blue-600 mt-1">
                      Need to purchase
                    </p>
                  )}
                  {material.vendorNeededQty === 0 && (
                    <p className="text-xs text-gray-500 mt-1">Not needed</p>
                  )}
                </div>
              </div>

              {/* Status Message */}
              {isFullyAvailable && (
                <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-100 px-3 py-2 rounded-lg">
                  <CheckCircle className="w-4 h-4" />
                  <span className="font-medium">Fully available in M2 Store</span>
                </div>
              )}
              {isPartiallyAvailable && (
                <div className="mt-3 flex items-center gap-2 text-sm text-yellow-700 bg-yellow-100 px-3 py-2 rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-medium">
                    {material.m2AvailableQty} {material.unit} from M2, {material.vendorNeededQty} {material.unit} from vendor
                  </span>
                </div>
              )}
              {isNotAvailable && (
                <div className="mt-3 flex items-center gap-2 text-sm text-blue-700 bg-blue-100 px-3 py-2 rounded-lg">
                  <Truck className="w-4 h-4" />
                  <span className="font-medium">Full vendor purchase required</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Section */}
      <div className="px-6 py-4 bg-white border-t border-gray-200">
        {overallStatus === 'full' && (
          <div>
            <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-green-900 mb-1">
                  All materials available in M2 Store!
                </p>
                <p className="text-sm text-green-700">
                  No vendor purchase needed. Materials will be automatically dispatched from internal inventory.
                </p>
              </div>
            </div>
            <button
              onClick={onConfirmM2Only}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center justify-center gap-2"
            >
              <Store className="w-5 h-5" />
              Confirm - Use M2 Store Only
            </button>
          </div>
        )}

        {overallStatus === 'partial' && (
          <div>
            <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-yellow-900 mb-1">
                  Split Procurement Required
                </p>
                <p className="text-sm text-yellow-700">
                  Available materials will be automatically allocated from M2 Store. You'll need to select vendors for the remaining quantities.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-green-50 border border-green-200 rounded-lg">
                <Store className="w-5 h-5 text-green-600 mx-auto mb-1" />
                <p className="text-xs text-green-700 font-medium">From M2 Store</p>
                <p className="text-sm font-semibold text-green-900 mt-1">Auto-allocated</p>
              </div>
              <div className="text-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Truck className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <p className="text-xs text-blue-700 font-medium">From Vendor</p>
                <p className="text-sm font-semibold text-blue-900 mt-1">Select vendors</p>
              </div>
            </div>
            <button
              onClick={onProceedWithSplit}
              className="w-full mt-4 px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-semibold flex items-center justify-center gap-2"
            >
              <TrendingUp className="w-5 h-5" />
              Proceed with Split Procurement
            </button>
          </div>
        )}

        {overallStatus === 'none' && (
          <div>
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
              <Truck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-blue-900 mb-1">
                  Vendor Purchase Required
                </p>
                <p className="text-sm text-blue-700">
                  Materials are not available in M2 Store. Please select vendors to purchase from.
                </p>
              </div>
            </div>
            <button
              onClick={onProceedVendorOnly}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-2"
            >
              <Truck className="w-5 h-5" />
              Proceed to Vendor Selection
            </button>
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-600 flex items-center gap-2">
          <Package className="w-4 h-4" />
          M2 Store Priority: Internal inventory is always checked first to optimize costs and delivery time
        </p>
      </div>
    </div>
  );
};

export default M2AvailabilityCard;

// Helper function to calculate availability (can be used by parent components)
export const calculateM2Availability = (
  requestedQty: number,
  m2StockQty: number
): {
  m2AvailableQty: number;
  vendorNeededQty: number;
  availabilityPercentage: number;
} => {
  const m2AvailableQty = Math.min(requestedQty, m2StockQty);
  const vendorNeededQty = Math.max(0, requestedQty - m2StockQty);
  const availabilityPercentage = requestedQty > 0 ? (m2AvailableQty / requestedQty) * 100 : 0;

  return {
    m2AvailableQty,
    vendorNeededQty,
    availabilityPercentage
  };
};
