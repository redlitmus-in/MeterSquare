import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, Package, CheckCircle, X, Save, RefreshCw, FileText, RotateCcw, AlertTriangle, Trash2 } from 'lucide-react';
import { inventoryService, InventoryTransaction, InventoryMaterial, MaterialReturn, MaterialCondition, CreateMaterialReturnData } from '../services/inventoryService';

type TabType = 'grn' | 'returns';

interface Project {
  project_id: number;
  project_name: string;
  project_code: string;
}

const ReceiveStock: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('grn');
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [returns, setReturns] = useState<MaterialReturn[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for new GRN
  const [formData, setFormData] = useState({
    inventory_material_id: 0,
    quantity: 0,
    unit_price: 0,
    reference_number: '',
    notes: ''
  });

  // Form state for new Return
  const [returnFormData, setReturnFormData] = useState<CreateMaterialReturnData>({
    inventory_material_id: 0,
    project_id: 0,
    quantity: 0,
    condition: 'Good',
    add_to_stock: true,
    return_reason: '',
    reference_number: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [txnData, matData, returnsData, projectsData] = await Promise.all([
        inventoryService.getAllTransactions(),
        inventoryService.getAllInventoryItems(),
        inventoryService.getAllMaterialReturns(),
        inventoryService.getAllProjects()
      ]);
      // Filter only PURCHASE transactions
      const purchaseTransactions = (txnData?.transactions || txnData || []).filter(
        (t: InventoryTransaction) => t.transaction_type === 'PURCHASE' || (t.transaction_type as string).toLowerCase() === 'purchase'
      );
      setTransactions(purchaseTransactions);
      setMaterials(matData || []);
      setReturns(returnsData?.returns || []);
      setProjects(projectsData?.projects || projectsData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter transactions
  const filteredTransactions = transactions.filter(txn => {
    const material = materials.find(m => m.inventory_material_id === txn.inventory_material_id);
    const materialName = material?.material_name || '';
    const materialCode = material?.material_code || '';
    const refNumber = txn.reference_number || '';

    return (
      materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      materialCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      refNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // Filter returns
  const filteredReturns = returns.filter(ret => {
    const materialName = ret.material_name || '';
    const materialCode = ret.material_code || '';
    const refNumber = ret.reference_number || '';
    const projectName = ret.project_details?.project_name || '';

    return (
      materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      materialCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      refNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      projectName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const getMaterialById = (id: number) => {
    return materials.find(m => m.inventory_material_id === id);
  };

  const handleCreateGRN = async () => {
    if (!formData.inventory_material_id || formData.quantity <= 0) {
      alert('Please select a material and enter quantity');
      return;
    }

    setSaving(true);
    try {
      await inventoryService.createTransaction({
        inventory_material_id: formData.inventory_material_id,
        transaction_type: 'PURCHASE',
        quantity: formData.quantity,
        unit_price: formData.unit_price,
        total_amount: formData.quantity * formData.unit_price,
        reference_number: formData.reference_number || `GRN-${Date.now()}`,
        notes: formData.notes
      });

      setShowCreateModal(false);
      setFormData({
        inventory_material_id: 0,
        quantity: 0,
        unit_price: 0,
        reference_number: '',
        notes: ''
      });
      fetchData();
    } catch (error) {
      console.error('Error creating GRN:', error);
      alert('Failed to create GRN');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateReturn = async () => {
    if (!returnFormData.inventory_material_id || !returnFormData.project_id || returnFormData.quantity <= 0) {
      alert('Please select a material, project, and enter quantity');
      return;
    }

    setSaving(true);
    try {
      await inventoryService.createMaterialReturn(returnFormData);

      setShowReturnModal(false);
      setReturnFormData({
        inventory_material_id: 0,
        project_id: 0,
        quantity: 0,
        condition: 'Good',
        add_to_stock: true,
        return_reason: '',
        reference_number: '',
        notes: ''
      });
      fetchData();
    } catch (error: any) {
      console.error('Error creating return:', error);
      alert(error.message || 'Failed to create return');
    } finally {
      setSaving(false);
    }
  };

  const handleMaterialSelect = (materialId: number) => {
    const material = getMaterialById(materialId);
    setFormData({
      ...formData,
      inventory_material_id: materialId,
      unit_price: material?.unit_price || 0
    });
  };

  const handleReturnMaterialSelect = (materialId: number) => {
    setReturnFormData({
      ...returnFormData,
      inventory_material_id: materialId
    });
  };

  const getConditionBadge = (condition: MaterialCondition) => {
    switch (condition) {
      case 'Good':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Good</span>;
      case 'Damaged':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Damaged</span>;
      case 'Defective':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Defective</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{condition}</span>;
    }
  };

  const getDisposalStatusBadge = (status: string | null | undefined) => {
    if (!status) return null;
    switch (status) {
      case 'pending_review':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">Pending Review</span>;
      case 'approved_disposal':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Approved for Disposal</span>;
      case 'disposed':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Disposed</span>;
      case 'repaired':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Repaired</span>;
      default:
        return null;
    }
  };

  // Stats
  const totalReceived = transactions.length;
  const totalValue = transactions.reduce((sum, t) => sum + (t.total_amount || 0), 0);
  const todayTransactions = transactions.filter(t => {
    const today = new Date().toDateString();
    return t.created_at && new Date(t.created_at).toDateString() === today;
  }).length;

  // Return stats
  const totalReturns = returns.length;
  const goodReturns = returns.filter(r => r.condition === 'Good').length;
  const pendingDisposal = returns.filter(r => r.disposal_status === 'pending_review').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header Skeleton */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between animate-pulse">
              <div>
                <div className="h-8 bg-gray-200 rounded w-56 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-72"></div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-10 bg-gray-200 rounded-lg w-24"></div>
                <div className="h-10 bg-gray-200 rounded-lg w-32"></div>
              </div>
            </div>
            {/* Tab Switcher Skeleton */}
            <div className="mt-6 border-b border-gray-200 animate-pulse">
              <div className="flex space-x-8">
                <div className="h-10 bg-gray-200 rounded w-32"></div>
                <div className="h-10 bg-gray-200 rounded w-36"></div>
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Stats Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                    <div className="h-8 bg-gray-200 rounded w-16"></div>
                  </div>
                  <div className="h-12 w-12 bg-gray-200 rounded-full"></div>
                </div>
              </div>
            ))}
          </div>
          {/* Search Skeleton */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6 animate-pulse">
            <div className="h-10 bg-gray-200 rounded-lg w-full"></div>
          </div>
          {/* Table Skeleton */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden animate-pulse">
            <div className="h-12 bg-gray-100"></div>
            <div className="divide-y divide-gray-100">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4">
                  <div className="h-4 bg-gray-200 rounded w-28"></div>
                  <div className="h-4 bg-gray-200 rounded w-40"></div>
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-4 bg-gray-200 rounded w-20"></div>
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                  <div className="h-4 bg-gray-200 rounded w-32 flex-1"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {activeTab === 'grn' ? 'Goods Receipt Note (GRN)' : 'Material Returns'}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {activeTab === 'grn'
                  ? 'Record and manage incoming stock from vendors'
                  : 'Track returned materials with condition assessment'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchData}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              {activeTab === 'grn' ? (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  Create GRN
                </button>
              ) : (
                <button
                  onClick={() => setShowReturnModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <RotateCcw className="w-5 h-5" />
                  Record Return
                </button>
              )}
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="mt-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('grn')}
                className={`pb-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'grn'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Goods Receipt
                  <span className="ml-2 bg-green-100 text-green-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {totalReceived}
                  </span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('returns')}
                className={`pb-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'returns'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Material Returns
                  <span className="ml-2 bg-blue-100 text-blue-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {totalReturns}
                  </span>
                  {pendingDisposal > 0 && (
                    <span className="ml-1 bg-orange-100 text-orange-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {pendingDisposal} pending
                    </span>
                  )}
                </div>
              </button>
            </nav>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats - GRN Tab */}
        {activeTab === 'grn' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total GRNs</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{totalReceived}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Today's Receipts</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{todayTransactions}</p>
                </div>
                <div className="p-3 bg-yellow-100 rounded-full">
                  <Package className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Materials in Inventory</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{materials.length}</p>
                </div>
                <div className="p-3 bg-orange-100 rounded-full">
                  <CheckCircle className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Value Received</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900">
                    {totalValue >= 100000 ? `${(totalValue / 100000).toFixed(1)}L` : `${totalValue.toLocaleString()}`}
                  </p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary Stats - Returns Tab */}
        {activeTab === 'returns' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Returns</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{totalReturns}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <RotateCcw className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Good Condition</p>
                  <p className="mt-2 text-3xl font-bold text-green-600">{goodReturns}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending Disposal</p>
                  <p className="mt-2 text-3xl font-bold text-orange-600">{pendingDisposal}</p>
                </div>
                <div className="p-3 bg-orange-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Added to Stock</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">
                    {returns.filter(r => r.add_to_stock).length}
                  </p>
                </div>
                <div className="p-3 bg-purple-100 rounded-full">
                  <Package className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={activeTab === 'grn'
                ? "Search by material name, code, or reference number..."
                : "Search by material, project, or reference..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        </div>

        {/* GRN Transaction List */}
        {activeTab === 'grn' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Reference</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Material</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Unit Price</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredTransactions.length > 0 ? (
                    filteredTransactions.map((txn) => {
                      const material = getMaterialById(txn.inventory_material_id);
                      return (
                        <tr key={txn.inventory_transaction_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900">
                              {txn.reference_number || `TXN-${txn.inventory_transaction_id}`}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{material?.material_name || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">{material?.material_code || '-'}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className="text-sm font-semibold text-green-600">
                              +{txn.quantity} {material?.unit || ''}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                            {txn.unit_price?.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className="text-sm font-bold text-gray-900">
                              {txn.total_amount?.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Calendar className="w-4 h-4" />
                              {txn.created_at ? new Date(txn.created_at).toLocaleDateString() : '-'}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-500 truncate max-w-[200px] block">
                              {txn.notes || '-'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-1">No transactions found</h3>
                        <p className="text-sm text-gray-500">
                          {searchTerm ? 'Try adjusting your search' : 'Create your first GRN to start receiving stock'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Returns List */}
        {activeTab === 'returns' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Reference</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Material</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Project</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Condition</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Stock Updated</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {filteredReturns.length > 0 ? (
                    filteredReturns.map((ret) => (
                      <tr key={ret.return_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-gray-900">
                            {ret.reference_number || `RET-${ret.return_id}`}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{ret.material_name || 'Unknown'}</p>
                            <p className="text-xs text-gray-500">{ret.material_code || '-'}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {ret.project_details?.project_name || '-'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {ret.project_details?.project_code || ''}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-sm font-semibold text-blue-600">
                            {ret.quantity} {ret.unit || ''}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {getConditionBadge(ret.condition)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {ret.add_to_stock ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Yes
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              No
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {getDisposalStatusBadge(ret.disposal_status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Calendar className="w-4 h-4" />
                            {ret.created_at ? new Date(ret.created_at).toLocaleDateString() : '-'}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
                        <RotateCcw className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-1">No returns found</h3>
                        <p className="text-sm text-gray-500">
                          {searchTerm ? 'Try adjusting your search' : 'Record your first material return'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Results Count */}
        {((activeTab === 'grn' && filteredTransactions.length > 0) ||
          (activeTab === 'returns' && filteredReturns.length > 0)) && (
          <div className="mt-6 text-sm text-gray-600 text-center">
            Showing {activeTab === 'grn' ? filteredTransactions.length : filteredReturns.length} of {activeTab === 'grn' ? transactions.length : returns.length} {activeTab === 'grn' ? 'transactions' : 'returns'}
          </div>
        )}
      </div>

      {/* Create GRN Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Create New GRN</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Material <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.inventory_material_id}
                  onChange={(e) => handleMaterialSelect(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value={0}>Select Material</option>
                  {materials.map((material) => (
                    <option key={material.inventory_material_id} value={material.inventory_material_id}>
                      {material.material_name} ({material.material_code}) - Current Stock: {material.current_stock} {material.unit}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.quantity || ''}
                    onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Enter quantity"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.unit_price || ''}
                    onChange={(e) => setFormData({ ...formData, unit_price: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="Price per unit"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={formData.reference_number}
                  onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="e.g., GRN-2025-001, PO-123"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any additional notes..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              {formData.quantity > 0 && formData.unit_price > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800">
                    <strong>Total Amount:</strong> {(formData.quantity * formData.unit_price).toLocaleString()}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGRN}
                  disabled={saving || !formData.inventory_material_id || formData.quantity <= 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save GRN
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Return Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Record Material Return</h2>
              <button
                onClick={() => setShowReturnModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Material <span className="text-red-500">*</span>
                </label>
                <select
                  value={returnFormData.inventory_material_id}
                  onChange={(e) => handleReturnMaterialSelect(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={0}>Select Material</option>
                  {materials.filter(m => m.is_returnable).map((material) => (
                    <option key={material.inventory_material_id} value={material.inventory_material_id}>
                      {material.material_name} ({material.material_code})
                    </option>
                  ))}
                </select>
                {materials.filter(m => m.is_returnable).length === 0 && (
                  <p className="text-xs text-orange-600 mt-1">No returnable materials found. Mark materials as returnable in Materials Master.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project (Return From) <span className="text-red-500">*</span>
                </label>
                <select
                  value={returnFormData.project_id}
                  onChange={(e) => setReturnFormData({ ...returnFormData, project_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={0}>Select Project</option>
                  {projects.map((project) => (
                    <option key={project.project_id} value={project.project_id}>
                      {project.project_name} ({project.project_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={returnFormData.quantity || ''}
                  onChange={(e) => setReturnFormData({ ...returnFormData, quantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter quantity"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Condition <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4">
                  {(['Good', 'Damaged', 'Defective'] as MaterialCondition[]).map((condition) => (
                    <label
                      key={condition}
                      className={`flex items-center gap-2 px-4 py-3 border rounded-lg cursor-pointer transition-all ${
                        returnFormData.condition === condition
                          ? condition === 'Good'
                            ? 'border-green-500 bg-green-50'
                            : condition === 'Damaged'
                            ? 'border-yellow-500 bg-yellow-50'
                            : 'border-red-500 bg-red-50'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="condition"
                        value={condition}
                        checked={returnFormData.condition === condition}
                        onChange={(e) => setReturnFormData({
                          ...returnFormData,
                          condition: e.target.value as MaterialCondition,
                          add_to_stock: e.target.value === 'Good' ? returnFormData.add_to_stock : false
                        })}
                        className="sr-only"
                      />
                      {condition === 'Good' && <CheckCircle className="w-5 h-5 text-green-600" />}
                      {condition === 'Damaged' && <AlertTriangle className="w-5 h-5 text-yellow-600" />}
                      {condition === 'Defective' && <Trash2 className="w-5 h-5 text-red-600" />}
                      <span className={`font-medium ${
                        condition === 'Good' ? 'text-green-700' :
                        condition === 'Damaged' ? 'text-yellow-700' : 'text-red-700'
                      }`}>
                        {condition}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {returnFormData.condition === 'Good' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={returnFormData.add_to_stock}
                      onChange={(e) => setReturnFormData({ ...returnFormData, add_to_stock: e.target.checked })}
                      className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <div>
                      <span className="font-medium text-green-800">Add to Inventory Stock</span>
                      <p className="text-sm text-green-600">
                        The returned quantity will be added back to the material's current stock
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {(returnFormData.condition === 'Damaged' || returnFormData.condition === 'Defective') && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
                    <div>
                      <span className="font-medium text-orange-800">Disposal Review Required</span>
                      <p className="text-sm text-orange-600">
                        This return will be marked for disposal review. You can approve disposal or mark as repaired later.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Return Reason
                </label>
                <input
                  type="text"
                  value={returnFormData.return_reason || ''}
                  onChange={(e) => setReturnFormData({ ...returnFormData, return_reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Excess material, Project completed, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Number
                </label>
                <input
                  type="text"
                  value={returnFormData.reference_number || ''}
                  onChange={(e) => setReturnFormData({ ...returnFormData, reference_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., RET-2025-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  rows={3}
                  value={returnFormData.notes || ''}
                  onChange={(e) => setReturnFormData({ ...returnFormData, notes: e.target.value })}
                  placeholder="Any additional notes about the return..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateReturn}
                  disabled={saving || !returnFormData.inventory_material_id || !returnFormData.project_id || returnFormData.quantity <= 0}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Record Return
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ReceiveStock);
