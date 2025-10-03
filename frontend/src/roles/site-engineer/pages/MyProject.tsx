import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BuildingOfficeIcon,
  MapPinIcon,
  CalendarIcon,
  UserIcon,
  ChartBarIcon,
  CubeIcon,
  ClipboardDocumentCheckIcon,
  EyeIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

interface BOQItem {
  id: number;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  status: 'not-started' | 'in-progress' | 'completed';
  progress: number;
  materials: {
    name: string;
    quantity: number;
    unit: string;
  }[];
}

const MyProject: React.FC = () => {
  const [selectedBOQItem, setSelectedBOQItem] = useState<BOQItem | null>(null);
  const [showBOQModal, setShowBOQModal] = useState(false);

  const project = {
    id: 1,
    name: 'Corporate Office - Tower A',
    client: 'Tech Solutions Inc.',
    location: 'Mumbai - Bandra Kurla Complex',
    floor: '5th Floor',
    workingHours: '9:00 AM - 6:00 PM',
    assignedBy: 'Sarah Johnson',
    assignedByRole: 'Project Manager',
    startDate: '2024-01-01',
    targetEndDate: '2024-03-31',
    progress: 68,
    totalBOQItems: 52,
    completedBOQItems: 35,
    inProgressBOQItems: 12,
    notStartedBOQItems: 5
  };

  const boqItems: BOQItem[] = [
    {
      id: 1,
      code: 'PW-01',
      description: 'Glass Partition Wall',
      unit: 'sqm',
      quantity: 120,
      status: 'completed',
      progress: 100,
      materials: [
        { name: 'Glass Panel 10mm', quantity: 120, unit: 'sqft' },
        { name: 'Aluminum Frame', quantity: 80, unit: 'rft' },
        { name: 'Sealant', quantity: 5, unit: 'tubes' }
      ]
    },
    {
      id: 2,
      code: 'FC-02',
      description: 'False Ceiling Grid System',
      unit: 'sqm',
      quantity: 180,
      status: 'in-progress',
      progress: 65,
      materials: [
        { name: 'Ceiling Tiles 2x2', quantity: 180, unit: 'sqm' },
        { name: 'Grid System', quantity: 200, unit: 'meter' },
        { name: 'Hangers & Wires', quantity: 100, unit: 'pcs' }
      ]
    },
    {
      id: 3,
      code: 'EL-03',
      description: 'Electrical Wiring Concealed',
      unit: 'point',
      quantity: 45,
      status: 'in-progress',
      progress: 40,
      materials: [
        { name: 'Electrical Wire 2.5mm', quantity: 500, unit: 'meter' },
        { name: 'Conduit Pipes', quantity: 200, unit: 'meter' },
        { name: 'Switch & Sockets', quantity: 45, unit: 'pcs' }
      ]
    },
    {
      id: 4,
      code: 'PT-04',
      description: 'Interior Painting',
      unit: 'sqm',
      quantity: 300,
      status: 'not-started',
      progress: 0,
      materials: [
        { name: 'Primer', quantity: 30, unit: 'ltr' },
        { name: 'Emulsion Paint', quantity: 50, unit: 'ltr' },
        { name: 'Putty', quantity: 40, unit: 'kg' }
      ]
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'in-progress':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'not-started':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
              <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-blue-900">My Assigned Project</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Project Details Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-md border border-gray-100 p-6 mb-6"
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Project Info */}
            <div className="lg:col-span-2">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <BuildingOfficeIcon className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{project.name}</h2>
                  <p className="text-gray-600">{project.client}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPinIcon className="w-4 h-4" />
                  <div>
                    <p className="font-medium">{project.location}</p>
                    <p className="text-xs text-gray-500">{project.floor}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <UserIcon className="w-4 h-4" />
                  <div>
                    <p className="font-medium">{project.assignedBy}</p>
                    <p className="text-xs text-gray-500">{project.assignedByRole}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <CalendarIcon className="w-4 h-4" />
                  <div>
                    <p className="font-medium">Start: {project.startDate}</p>
                    <p className="text-xs text-gray-500">Target: {project.targetEndDate}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <ClipboardDocumentCheckIcon className="w-4 h-4" />
                  <div>
                    <p className="font-medium">Working Hours</p>
                    <p className="text-xs text-gray-500">{project.workingHours}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress Summary */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-gray-600">Overall Progress</span>
                <span className="text-2xl font-bold text-blue-900">{project.progress}%</span>
              </div>

              <div className="w-full bg-blue-200 rounded-full h-3 mb-4">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all"
                  style={{ width: `${project.progress}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">Completed</p>
                  <p className="text-lg font-bold text-green-600">{project.completedBOQItems}</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">In Progress</p>
                  <p className="text-lg font-bold text-blue-600">{project.inProgressBOQItems}</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">Pending</p>
                  <p className="text-lg font-bold text-gray-600">{project.notStartedBOQItems}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* BOQ Items List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-md border border-gray-100 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">BOQ Items</h2>
              <p className="text-sm text-gray-500 mt-1">Work items for this project</p>
            </div>
            <div className="text-sm text-gray-600">
              Total: <span className="font-bold text-gray-900">{project.totalBOQItems}</span> items
            </div>
          </div>

          <div className="space-y-4">
            {boqItems.map((item) => (
              <div
                key={item.id}
                className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-mono rounded">
                        {item.code}
                      </span>
                      <h3 className="font-bold text-gray-900">{item.description}</h3>
                    </div>
                    <p className="text-sm text-gray-600">
                      Quantity: {item.quantity} {item.unit}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(item.status)}`}>
                      {item.status === 'in-progress' ? 'In Progress' : item.status === 'not-started' ? 'Not Started' : 'Completed'}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedBOQItem(item);
                        setShowBOQModal(true);
                      }}
                      className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      <EyeIcon className="w-5 h-5 text-blue-600" />
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>Progress</span>
                    <span className="font-semibold">{item.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        item.status === 'completed' ? 'bg-green-500' :
                        item.status === 'in-progress' ? 'bg-blue-500' :
                        'bg-gray-300'
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>

                {/* Materials Summary */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CubeIcon className="w-4 h-4 text-gray-600" />
                    <span className="text-xs font-semibold text-gray-700">Materials Required:</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {item.materials.slice(0, 3).map((material, idx) => (
                      <div key={idx} className="text-xs text-gray-600">
                        • {material.name}: {material.quantity} {material.unit}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* BOQ Item Detail Modal */}
        {showBOQModal && selectedBOQItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
            >
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-blue-900">BOQ Item Details</h2>
                  <p className="text-sm text-blue-700 mt-1">{selectedBOQItem.code} - {selectedBOQItem.description}</p>
                </div>
                <button
                  onClick={() => setShowBOQModal(false)}
                  className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                >
                  <XMarkIcon className="w-6 h-6 text-blue-900" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(80vh-100px)]">
                {/* Status */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Status</h3>
                  <div className="flex items-center gap-3">
                    <span className={`px-4 py-2 rounded-lg text-sm font-medium border ${getStatusColor(selectedBOQItem.status)}`}>
                      {selectedBOQItem.status === 'in-progress' ? 'In Progress' : selectedBOQItem.status === 'not-started' ? 'Not Started' : 'Completed'}
                    </span>
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${
                            selectedBOQItem.status === 'completed' ? 'bg-green-500' :
                            selectedBOQItem.status === 'in-progress' ? 'bg-blue-500' :
                            'bg-gray-300'
                          }`}
                          style={{ width: `${selectedBOQItem.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{selectedBOQItem.progress}% Complete</p>
                    </div>
                  </div>
                </div>

                {/* Quantity */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Quantity</h3>
                  <p className="text-lg font-bold text-gray-900">{selectedBOQItem.quantity} {selectedBOQItem.unit}</p>
                </div>

                {/* Materials Required */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Materials Required</h3>
                  <div className="space-y-2">
                    {selectedBOQItem.materials.map((material, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <span className="text-sm text-gray-700">{material.name}</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {material.quantity} {material.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setShowBOQModal(false)}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyProject;
