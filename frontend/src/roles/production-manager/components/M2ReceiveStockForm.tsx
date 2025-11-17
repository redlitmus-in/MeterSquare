import React, { useState } from 'react';
import { X, Package, Truck, Search, Plus, Trash2, ArrowDownCircle } from 'lucide-react';

interface M2ReceiveStockFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: any) => void;
}

// Mock material master data
const mockMaterialMaster = [
  { id: 1, name: 'Cement PPC 43', brand: 'UltraTech', size: '50 kg', unit: 'bags' },
  { id: 2, name: 'Steel Rebar 12mm', brand: 'Tata Steel', size: '12mm x 12m', unit: 'pcs' },
  { id: 3, name: 'Paint Enamel', brand: 'Asian Paints', size: '20 ltrs', unit: 'ltrs' },
  { id: 4, name: 'Cement OPC', brand: 'ACC', size: '50 kg', unit: 'bags' },
  { id: 5, name: 'Bricks Red', brand: 'Local Supplier', size: 'Standard', unit: 'pcs' },
  { id: 6, name: 'Sand M-Sand', brand: 'M-Sand', size: 'Bulk', unit: 'tons' },
  { id: 7, name: 'Tiles Vitrified', brand: 'Kajaria', size: '600x600mm', unit: 'sqft' },
  { id: 8, name: 'PVC Pipes 2 inch', brand: 'Finolex', size: '2 inch x 3m', unit: 'pcs' },
  { id: 9, name: 'Electrical Wire 2.5mm', brand: 'Polycab', size: '2.5mm sq', unit: 'meters' },
  { id: 10, name: 'Plywood Marine', brand: 'Greenply', size: '8x4 ft, 18mm', unit: 'sheets' }
];

// Mock vendors
const mockVendors = [
  { id: 1, name: 'ABC Suppliers', code: 'V-001' },
  { id: 2, name: 'XYZ Trading Co.', code: 'V-002' },
  { id: 3, name: 'Prime Materials', code: 'V-003' },
  { id: 4, name: 'Metro Suppliers', code: 'V-004' }
];

// Mock bin locations
const mockBinLocations = [
  'Rack A-01', 'Rack A-12', 'Rack A-15',
  'Rack B-05', 'Rack C-03', 'Rack D-08',
  'Rack E-02', 'Rack F-01', 'Rack G-05',
  'Section C', 'Yard-01', 'Yard-02'
];

type ReceiveType = 'vendor' | 'transfer';

interface MaterialLine {
  id: string;
  materialId: number | null;
  materialName: string;
  quantity: number;
  unit: string;
  binLocation: string;
  unitPrice: number;
}

const M2ReceiveStockForm: React.FC<M2ReceiveStockFormProps> = ({ isOpen, onClose, onSubmit }) => {
  const [receiveType, setReceiveType] = useState<ReceiveType>('vendor');
  const [selectedVendor, setSelectedVendor] = useState<number | null>(null);
  const [poNumber, setPoNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [materialLines, setMaterialLines] = useState<MaterialLine[]>([
    {
      id: '1',
      materialId: null,
      materialName: '',
      quantity: 0,
      unit: '',
      binLocation: '',
      unitPrice: 0
    }
  ]);

  const [showMaterialSearch, setShowMaterialSearch] = useState<string | null>(null);
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');

  if (!isOpen) return null;

  const handleAddMaterialLine = () => {
    const newLine: MaterialLine = {
      id: Date.now().toString(),
      materialId: null,
      materialName: '',
      quantity: 0,
      unit: '',
      binLocation: '',
      unitPrice: 0
    };
    setMaterialLines([...materialLines, newLine]);
  };

  const handleRemoveMaterialLine = (id: string) => {
    if (materialLines.length > 1) {
      setMaterialLines(materialLines.filter(line => line.id !== id));
    }
  };

  const handleMaterialSelect = (lineId: string, material: any) => {
    setMaterialLines(materialLines.map(line =>
      line.id === lineId
        ? {
            ...line,
            materialId: material.id,
            materialName: `${material.name} - ${material.brand} (${material.size})`,
            unit: material.unit
          }
        : line
    ));
    setShowMaterialSearch(null);
    setMaterialSearchTerm('');
  };

  const handleUpdateLine = (lineId: string, field: keyof MaterialLine, value: any) => {
    setMaterialLines(materialLines.map(line =>
      line.id === lineId ? { ...line, [field]: value } : line
    ));
  };

  const handleSubmit = () => {
    const formData = {
      receiveType,
      vendorId: selectedVendor,
      poNumber,
      invoiceNumber,
      receivedDate,
      notes,
      materials: materialLines.filter(line => line.materialId && line.quantity > 0)
    };

    onSubmit?.(formData);
    onClose();
  };

  const calculateTotal = () => {
    return materialLines.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0);
  };

  const filteredMaterials = mockMaterialMaster.filter(material =>
    material.name.toLowerCase().includes(materialSearchTerm.toLowerCase()) ||
    material.brand.toLowerCase().includes(materialSearchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />

        {/* Modal panel */}
        <div className="inline-block w-full max-w-5xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-blue-50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <ArrowDownCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Receive Stock into M2 Store</h3>
                <p className="text-sm text-gray-600">Add new inventory to M2 Store</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Form Content */}
          <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
            {/* Receive Type */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Receive Type
              </label>
              <div className="flex gap-4">
                <button
                  onClick={() => setReceiveType('vendor')}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                    receiveType === 'vendor'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <Truck className="w-5 h-5 mx-auto mb-1" />
                  <span className="block text-sm font-medium">From Vendor</span>
                </button>
                <button
                  onClick={() => setReceiveType('transfer')}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                    receiveType === 'transfer'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <Package className="w-5 h-5 mx-auto mb-1" />
                  <span className="block text-sm font-medium">Transfer/Return</span>
                </button>
              </div>
            </div>

            {/* Vendor Selection (only for vendor type) */}
            {receiveType === 'vendor' && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vendor *
                  </label>
                  <select
                    value={selectedVendor || ''}
                    onChange={(e) => setSelectedVendor(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select Vendor</option>
                    {mockVendors.map(vendor => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name} ({vendor.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PO Number
                  </label>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="PO-2025-001"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}

            {/* Invoice & Date */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Invoice/DC Number
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-2025-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Received Date *
                </label>
                <input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Material Lines */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Materials *
                </label>
                <button
                  onClick={handleAddMaterialLine}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Material
                </button>
              </div>

              <div className="space-y-3">
                {materialLines.map((line, index) => (
                  <div key={line.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-3">
                        {/* Material Selection */}
                        <div className="relative">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Material
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={line.materialName}
                              onClick={() => setShowMaterialSearch(line.id)}
                              onChange={(e) => setMaterialSearchTerm(e.target.value)}
                              placeholder="Click to search materials..."
                              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
                              readOnly={!!line.materialId}
                            />
                            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                          </div>

                          {/* Material Search Dropdown */}
                          {showMaterialSearch === line.id && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                              <div className="p-2">
                                <input
                                  type="text"
                                  value={materialSearchTerm}
                                  onChange={(e) => setMaterialSearchTerm(e.target.value)}
                                  placeholder="Search materials..."
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  autoFocus
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {filteredMaterials.map(material => (
                                  <button
                                    key={material.id}
                                    onClick={() => handleMaterialSelect(line.id, material)}
                                    className="w-full px-4 py-2 text-left hover:bg-blue-50 transition-colors"
                                  >
                                    <p className="font-medium text-gray-900">{material.name}</p>
                                    <p className="text-sm text-gray-600">
                                      {material.brand} • {material.size} • {material.unit}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Quantity, Bin, Price */}
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Quantity
                            </label>
                            <input
                              type="number"
                              value={line.quantity || ''}
                              onChange={(e) => handleUpdateLine(line.id, 'quantity', Number(e.target.value))}
                              placeholder="0"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Unit
                            </label>
                            <input
                              type="text"
                              value={line.unit}
                              readOnly
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Bin Location
                            </label>
                            <select
                              value={line.binLocation}
                              onChange={(e) => handleUpdateLine(line.id, 'binLocation', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">Select Bin</option>
                              {mockBinLocations.map(bin => (
                                <option key={bin} value={bin}>{bin}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Unit Price (₹)
                            </label>
                            <input
                              type="number"
                              value={line.unitPrice || ''}
                              onChange={(e) => handleUpdateLine(line.id, 'unitPrice', Number(e.target.value))}
                              placeholder="0"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                        </div>

                        {/* Line Total */}
                        {line.quantity > 0 && line.unitPrice > 0 && (
                          <div className="text-sm">
                            <span className="text-gray-600">Line Total: </span>
                            <span className="font-semibold text-gray-900">
                              ₹{(line.quantity * line.unitPrice).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Remove Button */}
                      {materialLines.length > 1 && (
                        <button
                          onClick={() => handleRemoveMaterialLine(line.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes / Remarks
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes about this receipt..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Total */}
            {calculateTotal() > 0 && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-gray-900">Total Value:</span>
                  <span className="text-2xl font-bold text-blue-600">
                    ₹{calculateTotal().toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <ArrowDownCircle className="w-5 h-5" />
              Receive Stock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(M2ReceiveStockForm);
