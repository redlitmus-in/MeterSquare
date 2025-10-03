import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CubeIcon,
  PlusIcon,
  ClockIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';

interface MaterialUsageRecord {
  id: number;
  materialName: string;
  quantity: number;
  unit: string;
  boqItem: string;
  boqItemCode: string;
  usedAt: string;
  recordedBy: string;
}

const MaterialUsage: React.FC = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedBOQ, setSelectedBOQ] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [quantity, setQuantity] = useState('');

  const [usageRecords, setUsageRecords] = useState<MaterialUsageRecord[]>([
    {
      id: 1,
      materialName: 'Glass Panel 10mm',
      quantity: 15,
      unit: 'sqft',
      boqItem: 'Glass Partition Wall',
      boqItemCode: 'PW-01',
      usedAt: '10:30 AM',
      recordedBy: 'Site Engineer'
    },
    {
      id: 2,
      materialName: 'Aluminum Frame',
      quantity: 8,
      unit: 'pcs',
      boqItem: 'Glass Partition Wall',
      boqItemCode: 'PW-01',
      usedAt: '11:00 AM',
      recordedBy: 'Site Engineer'
    },
    {
      id: 3,
      materialName: 'Electrical Wire 2.5mm',
      quantity: 25,
      unit: 'meter',
      boqItem: 'Electrical Wiring',
      boqItemCode: 'EL-03',
      usedAt: '12:15 PM',
      recordedBy: 'Site Engineer'
    }
  ]);

  const boqItems = [
    { code: 'PW-01', name: 'Glass Partition Wall' },
    { code: 'EL-03', name: 'Electrical Wiring' },
    { code: 'FC-02', name: 'False Ceiling' }
  ];

  const materials = [
    { name: 'Glass Panel 10mm', unit: 'sqft' },
    { name: 'Aluminum Frame', unit: 'pcs' },
    { name: 'Electrical Wire 2.5mm', unit: 'meter' },
    { name: 'Ceiling Tiles', unit: 'sqm' }
  ];

  const handleAddUsage = () => {
    if (!selectedBOQ || !selectedMaterial || !quantity) {
      toast.error('Please fill all fields');
      return;
    }

    const boq = boqItems.find(b => b.code === selectedBOQ);
    const mat = materials.find(m => m.name === selectedMaterial);

    const newRecord: MaterialUsageRecord = {
      id: Date.now(),
      materialName: selectedMaterial,
      quantity: Number(quantity),
      unit: mat?.unit || 'unit',
      boqItem: boq?.name || '',
      boqItemCode: selectedBOQ,
      usedAt: new Date().toLocaleTimeString(),
      recordedBy: 'Site Engineer'
    };

    setUsageRecords([newRecord, ...usageRecords]);
    setShowAddModal(false);
    setSelectedBOQ('');
    setSelectedMaterial('');
    setQuantity('');
    toast.success('Material usage recorded');
  };

  const todayTotal = usageRecords.length;
  const uniqueMaterials = new Set(usageRecords.map(r => r.materialName)).size;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <div className="bg-gradient-to-r from-purple-50 to-purple-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
                <CubeIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-purple-900">Material Usage Tracking</h1>
                <p className="text-sm text-purple-700 mt-1">Record daily material consumption</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Record Usage
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <p className="text-sm text-gray-500">Today's Entries</p>
            <p className="text-2xl font-bold text-gray-900">{todayTotal}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <p className="text-sm text-gray-500">Unique Materials</p>
            <p className="text-2xl font-bold text-purple-600">{uniqueMaterials}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <p className="text-sm text-gray-500">BOQ Items</p>
            <p className="text-2xl font-bold text-blue-600">{new Set(usageRecords.map(r => r.boqItemCode)).size}</p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-4">Today's Material Usage</h2>

          <div className="space-y-3">
            {usageRecords.map((record, index) => (
              <motion.div
                key={record.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-mono rounded">
                        {record.boqItemCode}
                      </span>
                      <h3 className="font-semibold text-gray-900">{record.materialName}</h3>
                    </div>
                    <p className="text-sm text-gray-600">BOQ Item: {record.boqItem}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-bold text-purple-600">{record.quantity} {record.unit}</p>
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                      <ClockIcon className="w-3 h-3" />
                      <span>{record.usedAt}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Add Usage Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full"
            >
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-6 py-4 border-b border-purple-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-purple-900">Record Material Usage</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-6 h-6 text-purple-900" />
                </button>
              </div>

              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      BOQ Item
                    </label>
                    <select
                      value={selectedBOQ}
                      onChange={(e) => setSelectedBOQ(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select BOQ Item</option>
                      {boqItems.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.code} - {item.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Material
                    </label>
                    <select
                      value={selectedMaterial}
                      onChange={(e) => setSelectedMaterial(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select Material</option>
                      {materials.map((mat) => (
                        <option key={mat.name} value={mat.name}>
                          {mat.name} ({mat.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Quantity Used
                    </label>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Enter quantity"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddUsage}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Record
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaterialUsage;
