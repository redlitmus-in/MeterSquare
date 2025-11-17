import React, { useState } from 'react';
import { Save, RefreshCw, AlertTriangle, CheckCircle, FileText, Calendar, Info } from 'lucide-react';

interface MaterialForStockTake {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  binLocation: string;
  systemStock: number;
  physicalCount: string;
  variance: number;
  variancePercentage: number;
  remarks: string;
}

// Mock materials data for stock take
const initialMaterials: MaterialForStockTake[] = [
  {
    id: '1',
    code: 'MAT-001',
    name: 'Portland Cement (50kg)',
    category: 'Cement',
    unit: 'Bags',
    binLocation: 'A-01-01',
    systemStock: 450,
    physicalCount: '',
    variance: 0,
    variancePercentage: 0,
    remarks: ''
  },
  {
    id: '2',
    code: 'MAT-002',
    name: 'TMT Steel 12mm',
    category: 'Steel',
    unit: 'Tons',
    binLocation: 'B-02-03',
    systemStock: 8.5,
    physicalCount: '',
    variance: 0,
    variancePercentage: 0,
    remarks: ''
  },
  {
    id: '3',
    code: 'MAT-003',
    name: 'Sand (M-Sand)',
    category: 'Aggregates',
    unit: 'CFT',
    binLocation: 'C-01-01',
    systemStock: 45,
    physicalCount: '',
    variance: 0,
    variancePercentage: 0,
    remarks: ''
  },
  {
    id: '4',
    code: 'MAT-004',
    name: 'Paint - Asian Paints (White)',
    category: 'Paint',
    unit: 'Ltr',
    binLocation: 'D-03-02',
    systemStock: 0,
    physicalCount: '',
    variance: 0,
    variancePercentage: 0,
    remarks: ''
  },
  {
    id: '5',
    code: 'MAT-005',
    name: 'Concrete Blocks (6")',
    category: 'Blocks',
    unit: 'Nos',
    binLocation: 'E-01-01',
    systemStock: 2500,
    physicalCount: '',
    variance: 0,
    variancePercentage: 0,
    remarks: ''
  },
  {
    id: '6',
    code: 'MAT-006',
    name: 'PVC Pipes 4"',
    category: 'Plumbing',
    unit: 'Mtr',
    binLocation: 'F-02-01',
    systemStock: 85,
    physicalCount: '',
    variance: 0,
    variancePercentage: 0,
    remarks: ''
  }
];

const StockTake: React.FC = () => {
  const [materials, setMaterials] = useState<MaterialForStockTake[]>(initialMaterials);
  const [stockTakeDate, setStockTakeDate] = useState(new Date().toISOString().split('T')[0]);
  const [conductedBy, setConductedBy] = useState('');

  // Calculate variance when physical count changes
  const handlePhysicalCountChange = (id: string, value: string) => {
    setMaterials(prev => prev.map(material => {
      if (material.id === id) {
        const physicalCount = value === '' ? 0 : parseFloat(value);
        const variance = physicalCount - material.systemStock;
        const variancePercentage = material.systemStock === 0 ? 0 : (variance / material.systemStock) * 100;

        return {
          ...material,
          physicalCount: value,
          variance,
          variancePercentage
        };
      }
      return material;
    }));
  };

  // Handle remarks change
  const handleRemarksChange = (id: string, value: string) => {
    setMaterials(prev => prev.map(material =>
      material.id === id ? { ...material, remarks: value } : material
    ));
  };

  // Get variance indicator
  const getVarianceIndicator = (variance: number, percentage: number) => {
    if (variance === 0) {
      return (
        <div className="flex items-center gap-1 text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span className="text-xs font-semibold">Match</span>
        </div>
      );
    }

    const absPercentage = Math.abs(percentage);
    const isCritical = absPercentage > 5;

    return (
      <div className="flex items-center gap-1">
        {isCritical && <AlertTriangle className="w-4 h-4 text-red-600" />}
        <span className={`text-xs font-bold ${
          isCritical ? 'text-red-600' : variance > 0 ? 'text-blue-600' : 'text-orange-600'
        }`}>
          {variance > 0 ? '+' : ''}{variance.toFixed(2)} ({percentage > 0 ? '+' : ''}{percentage.toFixed(2)}%)
        </span>
      </div>
    );
  };

  // Calculate summary
  const totalMaterials = materials.length;
  const countedMaterials = materials.filter(m => m.physicalCount !== '').length;
  const materialsWithVariance = materials.filter(m => m.variance !== 0 && m.physicalCount !== '').length;
  const criticalVariances = materials.filter(m => Math.abs(m.variancePercentage) > 5 && m.physicalCount !== '').length;

  const handleSave = () => {
    alert('Stock Take saved successfully! In production, this would create a stock take record requiring approval.');
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all counts?')) {
      setMaterials(initialMaterials);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Stock Take</h1>
              <p className="mt-1 text-sm text-gray-500">
                Physical stock count and reconciliation
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
              <button
                onClick={handleSave}
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors shadow-sm"
              >
                <Save className="w-5 h-5" />
                Save Stock Take
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Materials</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{totalMaterials}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Counted</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {countedMaterials} <span className="text-lg text-gray-500">/ {totalMaterials}</span>
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">With Variance</p>
                <p className="mt-2 text-3xl font-bold text-yellow-600">{materialsWithVariance}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Critical Variance</p>
                <p className="mt-2 text-3xl font-bold text-red-600">{criticalVariances}</p>
                <p className="text-xs text-red-600 font-medium">&gt;5% difference</p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-orange-900 mb-1">Stock Take Instructions</h4>
              <p className="text-xs text-orange-800 leading-relaxed">
                Count the physical quantity for each material at its bin location. Enter the count in the <strong>"Physical Count"</strong> column.
                System will automatically calculate variance. Variance &gt;5% requires remarks explaining the difference.
                Save when complete - requires supervisor approval before stock adjustment.
              </p>
            </div>
          </div>
        </div>

        {/* Stock Take Details */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock Take Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={stockTakeDate}
                  onChange={(e) => setStockTakeDate(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Conducted By</label>
              <input
                type="text"
                value={conductedBy}
                onChange={(e) => setConductedBy(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Progress</label>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1 bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-orange-500 h-3 rounded-full transition-all"
                    style={{ width: `${(countedMaterials / totalMaterials) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-700">
                  {((countedMaterials / totalMaterials) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stock Take Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Code</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Material Name</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Category</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Location</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">System Stock</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase bg-orange-50">
                    Physical Count
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Variance</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Remarks</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {materials.map((material) => {
                  const hasVariance = material.variance !== 0 && material.physicalCount !== '';
                  const isCritical = Math.abs(material.variancePercentage) > 5 && material.physicalCount !== '';
                  const needsRemarks = isCritical && !material.remarks;

                  return (
                    <tr
                      key={material.id}
                      className={`hover:bg-gray-50 transition-colors ${
                        isCritical ? 'bg-red-50' : hasVariance ? 'bg-yellow-50' : ''
                      }`}
                    >
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-xs font-semibold text-gray-900">{material.code}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm font-medium text-gray-900">{material.name}</div>
                        <div className="text-xs text-gray-500">Unit: {material.unit}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          {material.category}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-xs font-medium text-gray-600">{material.binLocation}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        <span className="text-sm font-bold text-gray-900">
                          {material.systemStock} {material.unit}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center bg-orange-50">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={material.physicalCount}
                          onChange={(e) => handlePhysicalCountChange(material.id, e.target.value)}
                          placeholder="Enter count"
                          className="w-28 px-2 py-1.5 border border-orange-300 rounded text-center text-sm font-semibold focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        {material.physicalCount !== '' ? (
                          getVarianceIndicator(material.variance, material.variancePercentage)
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={material.remarks}
                          onChange={(e) => handleRemarksChange(material.id, e.target.value)}
                          placeholder={needsRemarks ? 'Required - explain variance' : 'Optional remarks'}
                          className={`w-full px-2 py-1.5 border rounded text-xs focus:ring-2 focus:ring-orange-500 ${
                            needsRemarks ? 'border-red-300 bg-red-50' : 'border-gray-300'
                          }`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Footer */}
        <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <p><strong>Note:</strong> All critical variances (&gt;5%) must have remarks before saving.</p>
              <p className="mt-1">Stock adjustments will be applied after supervisor approval.</p>
            </div>
            <button
              onClick={handleSave}
              disabled={countedMaterials === 0}
              className="inline-flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-5 h-5" />
              Save Stock Take ({countedMaterials}/{totalMaterials})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(StockTake);
