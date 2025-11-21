import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, Package, CheckCircle, X, Save, RefreshCw, FileText } from 'lucide-react';
import { inventoryService, InventoryTransaction, InventoryMaterial } from '../services/inventoryService';

const ReceiveStock: React.FC = () => {
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [materials, setMaterials] = useState<InventoryMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for new GRN
  const [formData, setFormData] = useState({
    inventory_material_id: 0,
    quantity: 0,
    unit_price: 0,
    reference_number: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [txnData, matData] = await Promise.all([
        inventoryService.getAllTransactions(),
        inventoryService.getAllInventoryItems()
      ]);
      // Filter only PURCHASE transactions
      const purchaseTransactions = (txnData || []).filter(
        (t: InventoryTransaction) => t.transaction_type === 'PURCHASE'
      );
      setTransactions(purchaseTransactions);
      setMaterials(matData || []);
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

  const handleMaterialSelect = (materialId: number) => {
    const material = getMaterialById(materialId);
    setFormData({
      ...formData,
      inventory_material_id: materialId,
      unit_price: material?.unit_price || 0
    });
  };

  // Stats
  const totalReceived = transactions.length;
  const totalValue = transactions.reduce((sum, t) => sum + (t.total_amount || 0), 0);
  const todayTransactions = transactions.filter(t => {
    const today = new Date().toDateString();
    return t.created_at && new Date(t.created_at).toDateString() === today;
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading transactions...</p>
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
              <h1 className="text-3xl font-bold text-gray-900">Goods Receipt Note (GRN)</h1>
              <p className="mt-1 text-sm text-gray-500">
                Record and manage incoming stock from vendors
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
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
              >
                <Plus className="w-5 h-5" />
                Create GRN
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
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

        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by material name, code, or reference number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        </div>

        {/* Transaction List */}
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

        {/* Results Count */}
        {filteredTransactions.length > 0 && (
          <div className="mt-6 text-sm text-gray-600 text-center">
            Showing {filteredTransactions.length} of {transactions.length} transactions
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
    </div>
  );
};

export default React.memo(ReceiveStock);
