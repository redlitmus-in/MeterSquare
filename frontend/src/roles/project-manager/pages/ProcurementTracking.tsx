import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import {
  ShoppingCartIcon,
  DocumentTextIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  TruckIcon,
  BuildingOfficeIcon,
  CurrencyRupeeIcon,
  CalendarIcon,
  UserIcon,
  UserGroupIcon,
  PlusIcon,
  ChartBarIcon,
  EyeIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';

interface BOQItem {
  id: number;
  code: string;
  description: string;
  briefDescription?: string;
  unit: string;
  quantity: number;
  rate: number;
  estimatedCost: number;
  actualSpent: number;
  status: 'not-started' | 'in-progress' | 'completed';
  materials: {
    name: string;
    quantity: number;
    unit: string;
    rate: number;
    estimatedAmount: number;
  }[];
  labour: {
    type: string;
    quantity: number;
    unit: string;
    rate: number;
    estimatedAmount: number;
  }[];
  laborCost: number;
  overheadPercentage: number;
  profitMargin: number;
  procurements: Procurement[];
}

interface Procurement {
  id: number;
  itemName: string;
  quantity: number;
  unit: string;
  estimatedCost: number;
  actualCost?: number;
  vendor?: string;
  status: 'pending' | 'approved' | 'ordered' | 'delivered';
  requestDate: string;
  requestedBy: string;
  approvedBy?: string;
  deliveryDate?: string;
}

interface Project {
  id: number;
  name: string;
  client: string;
  location: string;
  floor: string;
  workingHours: string;
  projectDuration: string;
  totalBudget: number;
  totalSpent: number;
  materialCost: number;
  laborCost: number;
  overheadPercentage: number;
  profitMargin: number;
  boqItems: BOQItem[];
}

const ProcurementTracking: React.FC = () => {
  const location = useLocation();
  const [selectedProject, setSelectedProject] = useState<number>(location.state?.projectId || 1);
  const [selectedBOQItem, setSelectedBOQItem] = useState<BOQItem | null>(null);
  const [showBOQDetailsModal, setShowBOQDetailsModal] = useState(false);
  const [showProcurementModal, setShowProcurementModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'ordered' | 'delivered'>('all');

  // Update selected project when navigation state changes
  useEffect(() => {
    if (location.state?.projectId) {
      setSelectedProject(location.state.projectId);
    }
  }, [location.state]);

  const projects: Project[] = [
    {
      id: 1,
      name: 'Corporate Office - Tower A',
      client: 'Tech Solutions Inc.',
      location: 'Mumbai - Bandra Kurla Complex',
      floor: '5th Floor',
      workingHours: '9:00 AM - 6:00 PM',
      projectDuration: '4 months',
      totalBudget: 4500000,
      totalSpent: 2925000,
      materialCost: 2500000,
      laborCost: 1200000,
      overheadPercentage: 10,
      profitMargin: 18,
      boqItems: [
        {
          id: 1,
          code: 'PW-01',
          description: 'Glass Partition Wall',
          briefDescription: 'Supply and installation of 10mm toughened glass partition with aluminium frames',
          unit: 'sqm',
          quantity: 120,
          rate: 935,
          estimatedCost: 112035,
          actualSpent: 75000,
          status: 'in-progress',
          materials: [
            { name: 'Glass Panel 10mm', quantity: 120, unit: 'sqft', rate: 500, estimatedAmount: 60000 },
            { name: 'Aluminium Frame', quantity: 80, unit: 'rft', rate: 200, estimatedAmount: 16000 },
            { name: 'Sealant', quantity: 5, unit: 'tubes', rate: 300, estimatedAmount: 1500 }
          ],
          labour: [
            { type: 'Fabricator', quantity: 40, unit: 'hrs', rate: 500, estimatedAmount: 20000 },
            { type: 'Installer', quantity: 24, unit: 'hrs', rate: 400, estimatedAmount: 9600 },
            { type: 'Helper', quantity: 16, unit: 'hrs', rate: 200, estimatedAmount: 3200 }
          ],
          laborCost: 32800,
          overheadPercentage: 10,
          profitMargin: 18,
          procurements: [
            {
              id: 1,
              itemName: 'Glass Panel 10mm',
              quantity: 120,
              unit: 'sqft',
              estimatedCost: 60000,
              actualCost: 58000,
              vendor: 'Glass Solutions Ltd',
              status: 'delivered',
              requestDate: '2024-01-05',
              requestedBy: 'John Smith',
              approvedBy: 'PM',
              deliveryDate: '2024-01-10'
            },
            {
              id: 2,
              itemName: 'Aluminium Frame',
              quantity: 80,
              unit: 'rft',
              estimatedCost: 16000,
              status: 'pending',
              requestDate: '2024-01-20',
              requestedBy: 'John Smith'
            }
          ]
        },
        {
          id: 2,
          code: 'FC-02',
          description: 'False Ceiling Grid System',
          briefDescription: 'Supply and installation of mineral fiber false ceiling with grid system',
          unit: 'sqm',
          quantity: 180,
          rate: 1361,
          estimatedCost: 245000,
          actualSpent: 120000,
          status: 'in-progress',
          materials: [
            { name: 'Ceiling Tiles 2x2', quantity: 180, unit: 'sqm', rate: 650, estimatedAmount: 117000 },
            { name: 'Grid System', quantity: 200, unit: 'meter', rate: 280, estimatedAmount: 56000 },
            { name: 'Hangers & Wires', quantity: 100, unit: 'pcs', rate: 150, estimatedAmount: 15000 }
          ],
          labour: [
            { type: 'Ceiling Installer', quantity: 48, unit: 'hrs', rate: 450, estimatedAmount: 21600 },
            { type: 'Helper', quantity: 32, unit: 'hrs', rate: 200, estimatedAmount: 6400 }
          ],
          laborCost: 28000,
          overheadPercentage: 10,
          profitMargin: 18,
          procurements: [
            {
              id: 3,
              itemName: 'Ceiling Tiles 2x2',
              quantity: 180,
              unit: 'sqm',
              estimatedCost: 117000,
              actualCost: 115000,
              vendor: 'Interior Solutions',
              status: 'delivered',
              requestDate: '2024-01-08',
              requestedBy: 'John Smith',
              approvedBy: 'PM',
              deliveryDate: '2024-01-12'
            },
            {
              id: 4,
              itemName: 'Grid System',
              quantity: 200,
              unit: 'meter',
              estimatedCost: 56000,
              status: 'ordered',
              vendor: 'Grid Masters',
              requestDate: '2024-01-15',
              requestedBy: 'John Smith',
              approvedBy: 'PM'
            }
          ]
        },
        {
          id: 3,
          code: 'EL-03',
          description: 'Electrical Wiring Concealed',
          briefDescription: 'Concealed electrical wiring with modular switches and sockets',
          unit: 'point',
          quantity: 45,
          rate: 2856,
          estimatedCost: 128500,
          actualSpent: 0,
          status: 'not-started',
          materials: [
            { name: 'Electrical Wire 2.5mm', quantity: 500, unit: 'meter', rate: 45, estimatedAmount: 22500 },
            { name: 'Conduit Pipes', quantity: 200, unit: 'meter', rate: 60, estimatedAmount: 12000 },
            { name: 'Switch & Sockets', quantity: 45, unit: 'pcs', rate: 850, estimatedAmount: 38250 }
          ],
          labour: [
            { type: 'Electrician', quantity: 60, unit: 'hrs', rate: 550, estimatedAmount: 33000 },
            { type: 'Helper', quantity: 40, unit: 'hrs', rate: 200, estimatedAmount: 8000 }
          ],
          laborCost: 41000,
          overheadPercentage: 10,
          profitMargin: 18,
          procurements: []
        }
      ]
    }
  ];

  const currentProject = projects.find(p => p.id === selectedProject);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'approved': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'ordered': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'delivered': return 'bg-green-100 text-green-700 border-green-200';
      case 'not-started': return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'in-progress': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'completed': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const calculateBOQProgress = (item: BOQItem) => {
    if (item.estimatedCost === 0) return 0;
    return Math.min((item.actualSpent / item.estimatedCost) * 100, 100);
  };

  const handleProcurementAction = (procurementId: number, action: string) => {
    toast.success(`Procurement ${action} successfully`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-green-500 to-green-600 rounded-lg">
              <ShoppingCartIcon className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-blue-900">Procurement Tracking</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Enhanced Project Summary - Similar to TD */}
        {currentProject && (
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden mb-6">
            {/* Project Header */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-blue-900">{currentProject.name}</h2>
                  <p className="text-sm text-blue-700">{currentProject.client} • {currentProject.location} • {currentProject.floor}</p>
                  <p className="text-xs text-blue-600 mt-1">Working Hours: {currentProject.workingHours} • Duration: {currentProject.projectDuration}</p>
                </div>
                <div className="flex items-center gap-2">
                  <BuildingOfficeIcon className="w-8 h-8 text-blue-600" />
                </div>
              </div>
            </div>

            {/* Cost Breakdown Grid */}
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Total Budget</p>
                  <p className="text-lg font-bold text-gray-900">₹{(currentProject.totalBudget / 100000).toFixed(1)}L</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Material Cost</p>
                  <p className="text-lg font-bold text-blue-900">₹{(currentProject.materialCost / 100000).toFixed(1)}L</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Labor Cost</p>
                  <p className="text-lg font-bold text-green-900">₹{(currentProject.laborCost / 100000).toFixed(1)}L</p>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500">O&P Margin</p>
                  <p className="text-lg font-bold text-purple-900">{currentProject.overheadPercentage + currentProject.profitMargin}%</p>
                  <p className="text-[10px] text-purple-700">OH: {currentProject.overheadPercentage}% | P: {currentProject.profitMargin}%</p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Actual Spent</p>
                  <p className="text-lg font-bold text-orange-900">₹{(currentProject.totalSpent / 100000).toFixed(1)}L</p>
                  <p className={`text-[10px] ${currentProject.totalSpent > currentProject.totalBudget ? 'text-red-600' : 'text-green-600'}`}>
                    {((currentProject.totalSpent / currentProject.totalBudget) * 100).toFixed(0)}% utilized
                  </p>
                </div>
              </div>

              {/* Budget Progress Bar */}
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Budget Utilization</span>
                  <span className="font-semibold">{((currentProject.totalSpent / currentProject.totalBudget) * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-500 ${
                      currentProject.totalSpent > currentProject.totalBudget ? 'bg-red-500' :
                      (currentProject.totalSpent / currentProject.totalBudget) > 0.8 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.min((currentProject.totalSpent / currentProject.totalBudget) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BOQ Items with Procurement */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* BOQ Items List - Compact View */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">BOQ Items</h3>
                <span className="text-xs text-gray-500">Click to view details & procure</span>
              </div>
              <div className="space-y-3">
                {currentProject?.boqItems.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => setSelectedBOQItem(item)}
                    className={`border rounded-lg p-3 cursor-pointer transition-all ${
                      selectedBOQItem?.id === item.id
                        ? 'border-blue-500 bg-blue-50 shadow-md'
                        : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'
                    }`}
                  >
                    {/* Compact Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded">{item.code}</span>
                        <h4 className="text-sm font-semibold text-gray-900">{item.description}</h4>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(item.status)}`}>
                        {item.status}
                      </span>
                    </div>

                    {/* Key Info Grid - Compact */}
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      <div className="text-center p-1.5 bg-gray-50 rounded">
                        <p className="text-[10px] text-gray-500">Quantity</p>
                        <p className="text-xs font-semibold text-gray-900">{item.quantity} {item.unit}</p>
                      </div>
                      <div className="text-center p-1.5 bg-blue-50 rounded">
                        <p className="text-[10px] text-gray-500">Estimated</p>
                        <p className="text-xs font-semibold text-blue-900">₹{(item.estimatedCost / 1000).toFixed(0)}K</p>
                      </div>
                      <div className="text-center p-1.5 bg-green-50 rounded">
                        <p className="text-[10px] text-gray-500">Spent</p>
                        <p className="text-xs font-semibold text-green-900">₹{(item.actualSpent / 1000).toFixed(0)}K</p>
                      </div>
                      <div className={`text-center p-1.5 rounded ${
                        item.actualSpent > item.estimatedCost ? 'bg-red-50' :
                        item.actualSpent < item.estimatedCost ? 'bg-green-50' : 'bg-gray-50'
                      }`}>
                        <p className="text-[10px] text-gray-500">Variance</p>
                        <p className={`text-xs font-semibold ${
                          item.actualSpent > item.estimatedCost ? 'text-red-600' :
                          item.actualSpent < item.estimatedCost ? 'text-green-600' : 'text-gray-600'
                        }`}>
                          {item.actualSpent === item.estimatedCost ? '0%' :
                           `${item.actualSpent > item.estimatedCost ? '+' : ''}${((item.actualSpent - item.estimatedCost) / item.estimatedCost * 100).toFixed(0)}%`}
                        </p>
                      </div>
                    </div>

                    {/* Expandable Details (when selected) */}
                    {selectedBOQItem?.id === item.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 pt-3 border-t border-gray-200"
                      >
                        {/* Materials Summary */}
                        <div className="mb-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600 flex items-center gap-1">
                              <DocumentTextIcon className="w-3 h-3" />
                              Materials ({item.materials.length} items)
                            </span>
                            <span className="font-semibold text-gray-900">₹{item.materials.reduce((sum, m) => sum + m.estimatedAmount, 0).toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Labour Summary */}
                        <div className="mb-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600 flex items-center gap-1">
                              <UserGroupIcon className="w-3 h-3" />
                              Labour ({item.labour.length} types)
                            </span>
                            <span className="font-semibold text-gray-900">₹{item.laborCost.toLocaleString()}</span>
                          </div>
                        </div>

                        {/* O&P Summary */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600 flex items-center gap-1">
                              <ChartBarIcon className="w-3 h-3" />
                              O&P ({item.overheadPercentage}% + {item.profitMargin}%)
                            </span>
                            <span className="font-semibold text-gray-900">
                              ₹{((item.materials.reduce((sum, m) => sum + m.estimatedAmount, 0) + item.laborCost) * (item.overheadPercentage + item.profitMargin) / 100).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowBOQDetailsModal(true);
                            }}
                            className="flex-1 text-xs py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center justify-center gap-1"
                          >
                            <EyeIcon className="w-3 h-3" />
                            View BOQ Details
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowProcurementModal(true);
                            }}
                            className="flex-1 text-xs py-1.5 bg-green-500 text-white rounded hover:bg-green-600 transition-colors flex items-center justify-center gap-1"
                          >
                            <PlusIcon className="w-3 h-3" />
                            Add Procurement
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* Progress Bar */}
                    <div className="mt-2">
                      <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                        <span>Progress</span>
                        <span>{calculateBOQProgress(item).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-500 ${
                            item.actualSpent > item.estimatedCost ? 'bg-red-500' :
                            calculateBOQProgress(item) > 80 ? 'bg-green-500' :
                            calculateBOQProgress(item) > 50 ? 'bg-blue-500' : 'bg-yellow-500'
                          }`}
                          style={{ width: `${calculateBOQProgress(item)}%` }}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <button
                onClick={() => setShowProcurementModal(true)}
                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-colors"
              >
                <PlusIcon className="w-5 h-5" />
                Add New Procurement
              </button>

              {/* Note about locked estimates */}
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> Original BOQ estimates are locked for accountability.
                  The system tracks variations between estimated and actual costs automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Selected BOQ Item Procurements */}
          <div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Procurement Details</h3>

              {selectedBOQItem ? (
                <div className="space-y-3">
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm font-medium text-blue-900">{selectedBOQItem.code} - {selectedBOQItem.description}</p>
                    <div className="flex justify-between mt-2 text-xs text-blue-700">
                      <span>Budget: ₹{selectedBOQItem.estimatedCost.toLocaleString()}</span>
                      <span>Spent: ₹{selectedBOQItem.actualSpent.toLocaleString()}</span>
                    </div>
                  </div>

                  {selectedBOQItem.procurements.length > 0 ? (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {selectedBOQItem.procurements.map((procurement) => (
                        <div key={procurement.id} className="p-3 border border-gray-200 rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <h5 className="text-sm font-medium text-gray-900">{procurement.itemName}</h5>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(procurement.status)}`}>
                              {procurement.status}
                            </span>
                          </div>

                          <div className="space-y-1 text-xs text-gray-600">
                            <div className="flex justify-between">
                              <span>Quantity:</span>
                              <span className="font-medium">{procurement.quantity} {procurement.unit}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Estimated:</span>
                              <span className="font-medium">₹{procurement.estimatedCost.toLocaleString()}</span>
                            </div>
                            {procurement.actualCost && (
                              <div className="flex justify-between">
                                <span>Actual:</span>
                                <span className="font-medium text-green-600">₹{procurement.actualCost.toLocaleString()}</span>
                              </div>
                            )}
                            {procurement.vendor && (
                              <div className="flex justify-between">
                                <span>Vendor:</span>
                                <span className="font-medium">{procurement.vendor}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span>Requested:</span>
                              <span className="font-medium">{procurement.requestDate}</span>
                            </div>
                          </div>

                          {procurement.status === 'pending' && (
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={() => handleProcurementAction(procurement.id, 'approved')}
                                className="flex-1 text-xs py-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleProcurementAction(procurement.id, 'rejected')}
                                className="flex-1 text-xs py-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <ShoppingCartIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">No procurements yet</p>
                      <button
                        onClick={() => setShowProcurementModal(true)}
                        className="mt-3 text-xs text-blue-600 hover:text-blue-700"
                      >
                        Add first procurement
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <DocumentTextIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">Select a BOQ item to view procurements</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Add Procurement Modal */}
        {showProcurementModal && selectedBOQItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full"
            >
              <div className="bg-gradient-to-r from-green-50 to-green-100 px-6 py-4 border-b border-green-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-green-900">Add Procurement</h2>
                  <button
                    onClick={() => setShowProcurementModal(false)}
                    className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6 text-green-900" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">BOQ Item</p>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm font-medium text-blue-900">
                      {selectedBOQItem.code} - {selectedBOQItem.description}
                    </p>
                    <div className="flex justify-between mt-1">
                      <p className="text-xs text-blue-700">
                        Original Estimate: ₹{selectedBOQItem.estimatedCost.toLocaleString()}
                      </p>
                      <p className="text-xs text-blue-700">
                        Remaining: ₹{(selectedBOQItem.estimatedCost - selectedBOQItem.actualSpent).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Variation Note */}
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs text-yellow-800">
                    <strong>Important:</strong> Original estimates (₹{selectedBOQItem.estimatedCost.toLocaleString()}) are locked.
                    Enter actual market prices - the system will automatically track variations for profit analysis.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Item Name</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="e.g., Glass Panel 10mm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                      <input
                        type="number"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="120"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        placeholder="sqft"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Cost</label>
                    <input
                      type="number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="60000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vendor (Optional)</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Select or enter vendor name"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowProcurementModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      toast.success('Procurement request created successfully');
                      setShowProcurementModal(false);
                    }}
                    className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
                  >
                    Create Procurement
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* BOQ Details Modal - Same as TD View */}
        {showBOQDetailsModal && selectedBOQItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            >
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-blue-900">BOQ Item Details</h2>
                    <p className="text-sm text-blue-700">{selectedBOQItem.code} - {selectedBOQItem.description}</p>
                  </div>
                  <button
                    onClick={() => setShowBOQDetailsModal(false)}
                    className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6 text-blue-900" />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                {/* Item Overview */}
                <div className="mb-6">
                  <h3 className="font-bold text-gray-900 mb-2">{selectedBOQItem.description}</h3>
                  {selectedBOQItem.briefDescription && (
                    <p className="text-sm text-gray-600 mb-3">{selectedBOQItem.briefDescription}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span>Quantity: <strong>{selectedBOQItem.quantity} {selectedBOQItem.unit}</strong></span>
                    <span>Rate: <strong>₹{selectedBOQItem.rate}/{selectedBOQItem.unit}</strong></span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(selectedBOQItem.status)}`}>
                      {selectedBOQItem.status}
                    </span>
                  </div>
                </div>

                {/* Materials Breakdown - Detailed */}
                <div className="bg-blue-50 rounded-lg p-4 mb-4">
                  <p className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <DocumentTextIcon className="w-4 h-4" />
                    Raw Materials Breakdown
                  </p>
                  <div className="space-y-2">
                    {selectedBOQItem.materials.map((material, index) => (
                      <div key={index} className="flex items-center justify-between bg-white rounded p-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900">{material.name}</span>
                          <span className="text-xs text-gray-600 ml-2">
                            ({material.quantity} {material.unit} @ ₹{material.rate}/{material.unit})
                          </span>
                        </div>
                        <span className="font-semibold text-gray-900">
                          ₹{material.estimatedAmount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-blue-300 mt-3 pt-3">
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-blue-900">Total Materials:</span>
                      <span className="text-blue-900">
                        ₹{selectedBOQItem.materials.reduce((sum, m) => sum + m.estimatedAmount, 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Labour Breakdown - Detailed */}
                <div className="bg-green-50 rounded-lg p-4 mb-4">
                  <p className="text-sm font-semibold text-green-900 mb-3 flex items-center gap-2">
                    <UserGroupIcon className="w-4 h-4" />
                    Labour Breakdown
                  </p>
                  <div className="space-y-2">
                    {selectedBOQItem.labour.map((labor, index) => (
                      <div key={index} className="flex items-center justify-between bg-white rounded p-2">
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-900">{labor.type}</span>
                          <span className="text-xs text-gray-600 ml-2">
                            ({labor.quantity} {labor.unit} @ ₹{labor.rate}/{labor.unit})
                          </span>
                        </div>
                        <span className="font-semibold text-gray-900">
                          ₹{labor.estimatedAmount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-green-300 mt-3 pt-3">
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-green-900">Total Labour:</span>
                      <span className="text-green-900">₹{selectedBOQItem.laborCost.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Overhead & Profit Breakdown */}
                <div className="bg-orange-50 rounded-lg p-4 mb-4">
                  <p className="text-sm font-semibold text-orange-900 mb-3 flex items-center gap-2">
                    <ChartBarIcon className="w-4 h-4" />
                    Overheads & Profit
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between bg-white rounded p-2">
                      <span className="text-sm text-gray-700">
                        Overhead ({selectedBOQItem.overheadPercentage}% of Material + Labor)
                      </span>
                      <span className="font-semibold text-gray-900">
                        ₹{((selectedBOQItem.materials.reduce((sum, m) => sum + m.estimatedAmount, 0) + selectedBOQItem.laborCost) * selectedBOQItem.overheadPercentage / 100).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between bg-white rounded p-2">
                      <span className="text-sm text-gray-700">
                        Profit Margin ({selectedBOQItem.profitMargin}% of Material + Labor)
                      </span>
                      <span className="font-semibold text-gray-900">
                        ₹{((selectedBOQItem.materials.reduce((sum, m) => sum + m.estimatedAmount, 0) + selectedBOQItem.laborCost) * selectedBOQItem.profitMargin / 100).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cost Summary */}
                <div className="bg-gradient-to-r from-gray-100 to-gray-200 rounded-lg p-4 mb-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Cost Summary</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Material Cost:</span>
                      <span className="font-semibold">₹{selectedBOQItem.materials.reduce((sum, m) => sum + m.estimatedAmount, 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Labour Cost:</span>
                      <span className="font-semibold">₹{selectedBOQItem.laborCost.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Overhead ({selectedBOQItem.overheadPercentage}%):</span>
                      <span className="font-semibold">
                        ₹{((selectedBOQItem.materials.reduce((sum, m) => sum + m.estimatedAmount, 0) + selectedBOQItem.laborCost) * selectedBOQItem.overheadPercentage / 100).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Profit ({selectedBOQItem.profitMargin}%):</span>
                      <span className="font-semibold">
                        ₹{((selectedBOQItem.materials.reduce((sum, m) => sum + m.estimatedAmount, 0) + selectedBOQItem.laborCost) * selectedBOQItem.profitMargin / 100).toLocaleString()}
                      </span>
                    </div>
                    <div className="border-t border-gray-400 pt-2 mt-2">
                      <div className="flex justify-between">
                        <span className="font-bold text-gray-900">Estimated Selling Price:</span>
                        <span className="font-bold text-lg text-green-600">₹{selectedBOQItem.estimatedCost.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actual vs Estimated */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm font-semibold text-yellow-900 mb-3">Procurement Status</p>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-600">Actual Spent</p>
                      <p className="text-lg font-bold text-blue-600">₹{selectedBOQItem.actualSpent.toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-600">Remaining</p>
                      <p className="text-lg font-bold text-gray-600">
                        ₹{(selectedBOQItem.estimatedCost - selectedBOQItem.actualSpent).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-600">Variation</p>
                      <p className={`text-lg font-bold ${
                        selectedBOQItem.actualSpent > selectedBOQItem.estimatedCost ? 'text-red-600' :
                        selectedBOQItem.actualSpent < selectedBOQItem.estimatedCost ? 'text-green-600' : 'text-gray-600'
                      }`}>
                        {selectedBOQItem.actualSpent === selectedBOQItem.estimatedCost ? '0%' :
                         `${selectedBOQItem.actualSpent > selectedBOQItem.estimatedCost ? '+' : ''}${((selectedBOQItem.actualSpent - selectedBOQItem.estimatedCost) / selectedBOQItem.estimatedCost * 100).toFixed(1)}%`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowBOQDetailsModal(false);
                      setShowProcurementModal(true);
                    }}
                    className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <PlusIcon className="w-5 h-5" />
                    Add Procurement
                  </button>
                  <button
                    onClick={() => setShowBOQDetailsModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
                  >
                    Close
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

export default ProcurementTracking;