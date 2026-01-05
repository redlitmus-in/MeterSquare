import React, { useState } from 'react';
import { AlertTriangle, Package, ShoppingCart, TrendingDown, Bell, Filter, X } from 'lucide-react';

// Mock low stock alerts data
const mockLowStockAlerts = [
  {
    id: 1,
    material: 'Steel Rebar 12mm',
    brand: 'Tata Steel',
    size: '12mm x 12m',
    currentStock: 0,
    unit: 'pcs',
    reorderPoint: 200,
    maxStock: 500,
    binLocation: 'Rack B-05',
    severity: 'critical' as const,
    daysToStockout: 0,
    avgConsumption: '15 pcs/day',
    lastRestocked: '1 week ago',
    suggestedOrderQty: 500
  },
  {
    id: 2,
    material: 'Paint Enamel',
    brand: 'Asian Paints',
    size: '20 ltrs',
    currentStock: 0,
    unit: 'ltrs',
    reorderPoint: 50,
    maxStock: 200,
    binLocation: 'Rack C-03',
    severity: 'critical' as const,
    daysToStockout: 0,
    avgConsumption: '8 ltrs/day',
    lastRestocked: '5 days ago',
    suggestedOrderQty: 200
  },
  {
    id: 3,
    material: 'Cement OPC',
    brand: 'ACC',
    size: '50 kg',
    currentStock: 45,
    unit: 'bags',
    reorderPoint: 100,
    maxStock: 500,
    binLocation: 'Rack A-15',
    severity: 'critical' as const,
    daysToStockout: 3,
    avgConsumption: '12 bags/day',
    lastRestocked: '3 days ago',
    suggestedOrderQty: 455
  },
  {
    id: 4,
    material: 'Sand M-Sand',
    brand: 'M-Sand',
    size: 'Bulk',
    currentStock: 0.5,
    unit: 'tons',
    reorderPoint: 2,
    maxStock: 10,
    binLocation: 'Yard-01',
    severity: 'warning' as const,
    daysToStockout: 1,
    avgConsumption: '0.3 tons/day',
    lastRestocked: '4 days ago',
    suggestedOrderQty: 9.5
  },
  {
    id: 5,
    material: 'PVC Pipes 2 inch',
    brand: 'Finolex',
    size: '2 inch x 3m',
    currentStock: 120,
    unit: 'pcs',
    reorderPoint: 100,
    maxStock: 300,
    binLocation: 'Rack E-02',
    severity: 'warning' as const,
    daysToStockout: 15,
    avgConsumption: '8 pcs/day',
    lastRestocked: '2 days ago',
    suggestedOrderQty: 180
  },
  {
    id: 6,
    material: 'Electrical Wire 4mm',
    brand: 'Polycab',
    size: '4mm sq',
    currentStock: 180,
    unit: 'meters',
    reorderPoint: 200,
    maxStock: 1000,
    binLocation: 'Rack F-03',
    severity: 'warning' as const,
    daysToStockout: 18,
    avgConsumption: '10 m/day',
    lastRestocked: '1 week ago',
    suggestedOrderQty: 820
  }
];

type SeverityFilter = 'all' | 'critical' | 'warning';

const M2StockAlerts: React.FC = () => {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [showPOModal, setShowPOModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<typeof mockLowStockAlerts[0] | null>(null);

  // Filter alerts based on severity
  const filteredAlerts = mockLowStockAlerts.filter(alert =>
    severityFilter === 'all' || alert.severity === severityFilter
  );

  // Count by severity
  const criticalCount = mockLowStockAlerts.filter(a => a.severity === 'critical').length;
  const warningCount = mockLowStockAlerts.filter(a => a.severity === 'warning').length;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          badge: 'bg-red-100 text-red-800',
          icon: 'text-red-600'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          badge: 'bg-yellow-100 text-yellow-800',
          icon: 'text-yellow-600'
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-700',
          badge: 'bg-gray-100 text-gray-800',
          icon: 'text-gray-600'
        };
    }
  };

  const getStockPercentage = (current: number, max: number) => {
    return (current / max) * 100;
  };

  const handleCreatePO = (alert: typeof mockLowStockAlerts[0]) => {
    setSelectedAlert(alert);
    setShowPOModal(true);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-red-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Stock Alerts</h2>
              <p className="text-sm text-gray-600">
                {criticalCount} critical • {warningCount} warnings
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-600 hover:bg-white rounded-lg transition-colors">
              <Bell className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setSeverityFilter('all')}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              severityFilter === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            All ({mockLowStockAlerts.length})
          </button>
          <button
            onClick={() => setSeverityFilter('critical')}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              severityFilter === 'critical'
                ? 'bg-red-600 text-white'
                : 'bg-white text-red-700 hover:bg-red-50'
            }`}
          >
            Critical ({criticalCount})
          </button>
          <button
            onClick={() => setSeverityFilter('warning')}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              severityFilter === 'warning'
                ? 'bg-yellow-600 text-white'
                : 'bg-white text-yellow-700 hover:bg-yellow-50'
            }`}
          >
            Warning ({warningCount})
          </button>
        </div>
      </div>

      {/* Alerts List */}
      <div className="divide-y divide-gray-200">
        {filteredAlerts.map((alert) => {
          const colors = getSeverityColor(alert.severity);
          const stockPercentage = getStockPercentage(alert.currentStock, alert.maxStock);

          return (
            <div
              key={alert.id}
              className={`p-6 hover:bg-gray-50 transition-colors ${colors.bg} border-l-4 ${colors.border}`}
            >
              <div className="flex items-start justify-between">
                {/* Left Section - Material Info */}
                <div className="flex-1">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertTriangle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${colors.icon}`} />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{alert.material}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
                          {alert.severity.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {alert.brand} • {alert.size} • {alert.binLocation}
                      </p>
                    </div>
                  </div>

                  {/* Stock Level Visualization */}
                  <div className="ml-8 mb-3">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className={`font-semibold ${colors.text}`}>
                        {alert.currentStock} {alert.unit}
                      </span>
                      <span className="text-gray-500">
                        Reorder at: {alert.reorderPoint} {alert.unit}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 relative">
                      {/* Current Stock Bar */}
                      <div
                        className={`h-3 rounded-full transition-all ${
                          alert.severity === 'critical' ? 'bg-red-500' : 'bg-yellow-500'
                        }`}
                        style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                      />
                      {/* Reorder Point Marker */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-gray-900"
                        style={{ left: `${(alert.reorderPoint / alert.maxStock) * 100}%` }}
                      >
                        <div className="absolute -top-1 left-1/2 transform -translate-x-1/2">
                          <div className="w-3 h-3 bg-gray-900 rounded-full" />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                      <span>Current: {stockPercentage.toFixed(0)}%</span>
                      <span>Max: {alert.maxStock} {alert.unit}</span>
                    </div>
                  </div>

                  {/* Stock Analytics */}
                  <div className="ml-8 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs">Consumption</p>
                      <p className="font-medium text-gray-900 flex items-center gap-1">
                        <TrendingDown className="w-4 h-4 text-red-600" />
                        {alert.avgConsumption}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Days to Stockout</p>
                      <p className={`font-semibold ${
                        alert.daysToStockout === 0
                          ? 'text-red-600'
                          : alert.daysToStockout <= 3
                          ? 'text-orange-600'
                          : 'text-yellow-600'
                      }`}>
                        {alert.daysToStockout === 0 ? 'OUT OF STOCK' : `~${alert.daysToStockout} days`}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Last Restocked</p>
                      <p className="font-medium text-gray-900">{alert.lastRestocked}</p>
                    </div>
                  </div>
                </div>

                {/* Right Section - Actions */}
                <div className="ml-6 flex flex-col gap-2">
                  <button
                    onClick={() => handleCreatePO(alert)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 whitespace-nowrap"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Create PO
                  </button>
                  <div className="text-center text-sm">
                    <p className="text-gray-500 text-xs">Suggested Order</p>
                    <p className="font-semibold text-gray-900">
                      {alert.suggestedOrderQty} {alert.unit}
                    </p>
                  </div>
                </div>
              </div>

              {/* Warning Message for Critical Items */}
              {alert.severity === 'critical' && (
                <div className="ml-8 mt-3 p-3 bg-red-100 border border-red-300 rounded-lg">
                  <p className="text-sm text-red-800 font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {alert.currentStock === 0
                      ? 'Stock depleted! Immediate action required.'
                      : `Critical level! Only ${alert.daysToStockout} days of stock remaining.`}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredAlerts.length === 0 && (
        <div className="px-6 py-12 text-center">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No alerts found</h3>
          <p className="text-sm text-gray-500">
            All stock levels are healthy
          </p>
        </div>
      )}

      {/* Create PO Modal (Simple) */}
      {showPOModal && selectedAlert && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowPOModal(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <button
                onClick={() => setShowPOModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Purchase Order</h3>

              <div className="space-y-4 mb-6">
                <div>
                  <p className="text-sm text-gray-600">Material</p>
                  <p className="font-medium text-gray-900">{selectedAlert.material}</p>
                  <p className="text-sm text-gray-500">{selectedAlert.brand} • {selectedAlert.size}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity to Order
                  </label>
                  <input
                    type="number"
                    defaultValue={selectedAlert.suggestedOrderQty}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Suggested: {selectedAlert.suggestedOrderQty} {selectedAlert.unit}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Vendor
                  </label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    <option value="">Select a vendor</option>
                    <option value="1">ABC Suppliers (V-001)</option>
                    <option value="2">XYZ Trading Co. (V-002)</option>
                    <option value="3">Prime Materials (V-003)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowPOModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    alert('PO Created! (This is a mock action)');
                    setShowPOModal(false);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create PO
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default M2StockAlerts;
