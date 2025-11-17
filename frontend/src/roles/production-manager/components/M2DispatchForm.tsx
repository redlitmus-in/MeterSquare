import React, { useState } from 'react';
import { X, ArrowUpCircle, Search, Package, User, AlertCircle, CheckCircle } from 'lucide-react';

interface M2DispatchFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: any) => void;
  prefilledData?: {
    buyerName?: string;
    projectName?: string;
    changeRequestId?: string;
    materials?: Array<{
      materialId: number;
      materialName: string;
      requestedQty: number;
      unit: string;
    }>;
  };
}

// Mock buyers
const mockBuyers = [
  { id: 1, name: 'Priya Singh', email: 'priya.singh@metersquare.com' },
  { id: 2, name: 'Amit Kumar', email: 'amit.kumar@metersquare.com' },
  { id: 3, name: 'Rajesh Sharma', email: 'rajesh.sharma@metersquare.com' },
  { id: 4, name: 'Sneha Patel', email: 'sneha.patel@metersquare.com' }
];

// Mock projects
const mockProjects = [
  { id: 1, name: 'Project Alpha', code: 'PA-2025' },
  { id: 2, name: 'Project Beta', code: 'PB-2025' },
  { id: 3, name: 'Project Gamma', code: 'PG-2025' },
  { id: 4, name: 'Residential Complex A', code: 'RC-A-2025' }
];

// Mock recipients
const mockRecipients = [
  { id: 1, name: 'John Doe', role: 'Site Engineer' },
  { id: 2, name: 'Sarah Lee', role: 'Project Manager' },
  { id: 3, name: 'Mike Wilson', role: 'Site Supervisor' },
  { id: 4, name: 'Emily Chen', role: 'Foreman' }
];

// Mock M2 Store inventory with available quantities
const mockM2Inventory = [
  { id: 1, name: 'Cement PPC 43', brand: 'UltraTech', size: '50 kg', availableQty: 450, unit: 'bags', binLocation: 'Rack A-12' },
  { id: 2, name: 'Steel Rebar 12mm', brand: 'Tata Steel', size: '12mm x 12m', availableQty: 0, unit: 'pcs', binLocation: 'Rack B-05' },
  { id: 3, name: 'Paint Enamel', brand: 'Asian Paints', size: '20 ltrs', availableQty: 0, unit: 'ltrs', binLocation: 'Rack C-03' },
  { id: 4, name: 'Cement OPC', brand: 'ACC', size: '50 kg', availableQty: 45, unit: 'bags', binLocation: 'Rack A-15' },
  { id: 5, name: 'Bricks Red', brand: 'Local Supplier', size: 'Standard', availableQty: 15000, unit: 'pcs', binLocation: 'Section C' },
  { id: 6, name: 'Sand M-Sand', brand: 'M-Sand', size: 'Bulk', availableQty: 0.5, unit: 'tons', binLocation: 'Yard-01' },
  { id: 7, name: 'Tiles Vitrified', brand: 'Kajaria', size: '600x600mm', availableQty: 850, unit: 'sqft', binLocation: 'Rack D-08' },
  { id: 8, name: 'PVC Pipes 2 inch', brand: 'Finolex', size: '2 inch x 3m', availableQty: 120, unit: 'pcs', binLocation: 'Rack E-02' },
  { id: 9, name: 'Electrical Wire 2.5mm', brand: 'Polycab', size: '2.5mm sq', availableQty: 2500, unit: 'meters', binLocation: 'Rack F-01' },
  { id: 10, name: 'Plywood Marine', brand: 'Greenply', size: '8x4 ft, 18mm', availableQty: 35, unit: 'sheets', binLocation: 'Rack G-05' }
];

interface DispatchMaterialLine {
  id: string;
  materialId: number | null;
  materialName: string;
  availableQty: number;
  dispatchQty: number;
  unit: string;
  binLocation: string;
  notes: string;
}

const M2DispatchForm: React.FC<M2DispatchFormProps> = ({ isOpen, onClose, onSubmit, prefilledData }) => {
  const [selectedBuyer, setSelectedBuyer] = useState<number | null>(null);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<number | null>(null);
  const [changeRequestId, setChangeRequestId] = useState(prefilledData?.changeRequestId || '');
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [remarks, setRemarks] = useState('');

  const [materialLines, setMaterialLines] = useState<DispatchMaterialLine[]>(
    prefilledData?.materials?.map((m, idx) => ({
      id: (idx + 1).toString(),
      materialId: m.materialId,
      materialName: m.materialName,
      availableQty: mockM2Inventory.find(inv => inv.id === m.materialId)?.availableQty || 0,
      dispatchQty: m.requestedQty,
      unit: m.unit,
      binLocation: mockM2Inventory.find(inv => inv.id === m.materialId)?.binLocation || '',
      notes: ''
    })) || [
      {
        id: '1',
        materialId: null,
        materialName: '',
        availableQty: 0,
        dispatchQty: 0,
        unit: '',
        binLocation: '',
        notes: ''
      }
    ]
  );

  const [showMaterialSearch, setShowMaterialSearch] = useState<string | null>(null);
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');

  if (!isOpen) return null;

  const handleMaterialSelect = (lineId: string, material: any) => {
    setMaterialLines(materialLines.map(line =>
      line.id === lineId
        ? {
            ...line,
            materialId: material.id,
            materialName: `${material.name} - ${material.brand} (${material.size})`,
            availableQty: material.availableQty,
            unit: material.unit,
            binLocation: material.binLocation
          }
        : line
    ));
    setShowMaterialSearch(null);
    setMaterialSearchTerm('');
  };

  const handleUpdateLine = (lineId: string, field: keyof DispatchMaterialLine, value: any) => {
    setMaterialLines(materialLines.map(line =>
      line.id === lineId ? { ...line, [field]: value } : line
    ));
  };

  const handleSubmit = () => {
    const validMaterials = materialLines.filter(line => line.materialId && line.dispatchQty > 0);

    if (validMaterials.length === 0) {
      alert('Please add at least one material to dispatch');
      return;
    }

    if (!selectedBuyer || !selectedProject || !selectedRecipient) {
      alert('Please fill in all required fields');
      return;
    }

    // Check if any dispatch quantity exceeds available quantity
    const overDispatch = validMaterials.find(line => line.dispatchQty > line.availableQty);
    if (overDispatch) {
      alert(`Dispatch quantity for ${overDispatch.materialName} exceeds available stock`);
      return;
    }

    const formData = {
      buyerId: selectedBuyer,
      projectId: selectedProject,
      recipientId: selectedRecipient,
      changeRequestId,
      dispatchDate,
      priority,
      vehicleNumber,
      driverName,
      remarks,
      materials: validMaterials
    };

    onSubmit?.(formData);
    onClose();
  };

  const filteredMaterials = mockM2Inventory.filter(material =>
    material.name.toLowerCase().includes(materialSearchTerm.toLowerCase()) ||
    material.brand.toLowerCase().includes(materialSearchTerm.toLowerCase())
  );

  const canDispatch = (line: DispatchMaterialLine) => {
    return line.dispatchQty > 0 && line.dispatchQty <= line.availableQty;
  };

  const hasInsufficientStock = (line: DispatchMaterialLine) => {
    return line.dispatchQty > line.availableQty;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />

        {/* Modal panel */}
        <div className="inline-block w-full max-w-5xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-green-50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-600 rounded-lg">
                <ArrowUpCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Dispatch from M2 Store</h3>
                <p className="text-sm text-gray-600">Issue materials to buyer/project</p>
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
            {/* Buyer, Project, Recipient */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Buyer *
                </label>
                <select
                  value={selectedBuyer || ''}
                  onChange={(e) => setSelectedBuyer(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Select Buyer</option>
                  {mockBuyers.map(buyer => (
                    <option key={buyer.id} value={buyer.id}>{buyer.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project *
                </label>
                <select
                  value={selectedProject || ''}
                  onChange={(e) => setSelectedProject(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Select Project</option>
                  {mockProjects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipient (at site) *
                </label>
                <select
                  value={selectedRecipient || ''}
                  onChange={(e) => setSelectedRecipient(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">Select Recipient</option>
                  {mockRecipients.map(recipient => (
                    <option key={recipient.id} value={recipient.id}>
                      {recipient.name} ({recipient.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Change Request ID, Date, Priority */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Change Request ID
                </label>
                <input
                  type="text"
                  value={changeRequestId}
                  onChange={(e) => setChangeRequestId(e.target.value)}
                  placeholder="CR-2025-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dispatch Date *
                </label>
                <input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'normal' | 'urgent')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            {/* Materials Section */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Materials to Dispatch *
              </label>

              <div className="space-y-3">
                {materialLines.map((line) => (
                  <div key={line.id} className="p-4 border-2 rounded-lg bg-gray-50 border-gray-200">
                    {/* Material Selection */}
                    <div className="relative mb-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Material
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={line.materialName}
                          onClick={() => !prefilledData && setShowMaterialSearch(line.id)}
                          placeholder="Click to search materials..."
                          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent cursor-pointer"
                          readOnly
                        />
                        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      </div>

                      {/* Material Search Dropdown */}
                      {showMaterialSearch === line.id && !prefilledData && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div className="p-2">
                            <input
                              type="text"
                              value={materialSearchTerm}
                              onChange={(e) => setMaterialSearchTerm(e.target.value)}
                              placeholder="Search materials..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              autoFocus
                            />
                          </div>
                          <div className="max-h-48 overflow-y-auto">
                            {filteredMaterials.map(material => (
                              <button
                                key={material.id}
                                onClick={() => handleMaterialSelect(line.id, material)}
                                className="w-full px-4 py-2 text-left hover:bg-green-50 transition-colors"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium text-gray-900">{material.name}</p>
                                    <p className="text-sm text-gray-600">
                                      {material.brand} • {material.size} • {material.binLocation}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className={`text-sm font-semibold ${
                                      material.availableQty > 0 ? 'text-green-600' : 'text-red-600'
                                    }`}>
                                      {material.availableQty} {material.unit}
                                    </p>
                                    <p className="text-xs text-gray-500">Available</p>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quantity and Availability */}
                    {line.materialId && (
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Available in M2
                          </label>
                          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                            <Package className="w-4 h-4 text-blue-600" />
                            <span className="font-semibold text-blue-900">
                              {line.availableQty} {line.unit}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Bin: {line.binLocation}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Dispatch Quantity *
                          </label>
                          <input
                            type="number"
                            value={line.dispatchQty || ''}
                            onChange={(e) => handleUpdateLine(line.id, 'dispatchQty', Number(e.target.value))}
                            placeholder="0"
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${
                              hasInsufficientStock(line)
                                ? 'border-red-300 focus:ring-red-500'
                                : 'border-gray-300 focus:ring-green-500'
                            }`}
                          />
                          {hasInsufficientStock(line) && (
                            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Exceeds available stock
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Status
                          </label>
                          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 ${
                            canDispatch(line)
                              ? 'bg-green-50 border-green-200'
                              : 'bg-gray-50 border-gray-200'
                          }`}>
                            {canDispatch(line) ? (
                              <>
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                <span className="text-sm font-medium text-green-700">Ready</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-4 h-4 text-gray-400" />
                                <span className="text-sm font-medium text-gray-600">Pending</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Transport Details */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vehicle Number
                </label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="TN 01 AB 1234"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Driver Name
                </label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="Driver name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Remarks / Notes
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Any special instructions or notes..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
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
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <ArrowUpCircle className="w-5 h-5" />
              Dispatch Materials
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default M2DispatchForm;
