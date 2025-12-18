import React, { useState, useEffect } from 'react';
import { ArrowDownCircle, Package, Plus, Search, Calendar, FileText, Truck, User, CheckCircle, AlertCircle, DollarSign } from 'lucide-react';
import { inventoryService, InventoryMaterial } from '../services/inventoryService';
import ConfirmationModal from '../components/ConfirmationModal';

interface PurchaseTransaction {
  inventory_transaction_id?: number;
  inventory_material_id: number;
  material_code?: string;
  material_name?: string;
  brand?: string;
  size?: string;
  category?: string;
  unit?: string;
  transaction_type: 'PURCHASE';
  quantity: number;
  unit_price: number;
  total_amount: number;
  reference_number?: string;
  notes?: string;
  created_at?: string;
  created_by?: string;
}

const StockInPage: React.FC = () => {
  // Data states
  const [allMaterials, setAllMaterials] = useState<InventoryMaterial[]>([]);
  const [purchaseTransactions, setPurchaseTransactions] = useState<PurchaseTransaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<PurchaseTransaction[]>([]);

  // UI states
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Purchase form data
  const [purchaseFormData, setPurchaseFormData] = useState<PurchaseTransaction>({
    inventory_material_id: 0,
    transaction_type: 'PURCHASE',
    quantity: 0,
    unit_price: 0,
    total_amount: 0,
    reference_number: '',
    notes: ''
  });

  // Selected material for display
  const [selectedMaterial, setSelectedMaterial] = useState<InventoryMaterial | null>(null);

  // Confirmation modal
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {},
    confirmText: 'Confirm'
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    filterTransactions();
  }, [searchTerm, purchaseTransactions]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch materials and transactions in parallel for better performance
      const [materials, transactionsResult] = await Promise.all([
        inventoryService.getAllInventoryItems(),
        inventoryService.getAllInventoryTransactions({ transaction_type: 'PURCHASE' })
      ]);

      setAllMaterials(materials);
      setPurchaseTransactions(transactionsResult.transactions);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterTransactions = () => {
    let filtered = [...purchaseTransactions];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(txn =>
        txn.material_name?.toLowerCase().includes(search) ||
        txn.material_code?.toLowerCase().includes(search) ||
        txn.reference_number?.toLowerCase().includes(search)
      );
    }

    setFilteredTransactions(filtered);
  };

  const handleOpenPurchaseModal = () => {
    setPurchaseFormData({
      inventory_material_id: 0,
      transaction_type: 'PURCHASE',
      quantity: 0,
      unit_price: 0,
      total_amount: 0,
      reference_number: '',
      notes: ''
    });
    setSelectedMaterial(null);
    setShowPurchaseModal(true);
  };

  const handleMaterialSelect = (materialId: number) => {
    const material = allMaterials.find(m => m.inventory_material_id === materialId);
    if (material) {
      setSelectedMaterial(material);
      setPurchaseFormData({
        ...purchaseFormData,
        inventory_material_id: materialId,
        unit_price: material.unit_price || 0
      });
    }
  };

  const handleQuantityChange = (quantity: number) => {
    const total = quantity * purchaseFormData.unit_price;
    setPurchaseFormData({
      ...purchaseFormData,
      quantity,
      total_amount: total
    });
  };

  const handleUnitPriceChange = (unitPrice: number) => {
    const total = purchaseFormData.quantity * unitPrice;
    setPurchaseFormData({
      ...purchaseFormData,
      unit_price: unitPrice,
      total_amount: total
    });
  };

  const handleSavePurchase = async () => {
    try {
      // Validation
      if (!purchaseFormData.inventory_material_id) {
        alert('Please select a material');
        return;
      }
      if (purchaseFormData.quantity <= 0) {
        alert('Please enter a valid quantity');
        return;
      }
      if (purchaseFormData.unit_price <= 0) {
        alert('Please enter a valid unit price');
        return;
      }

      setConfirmModal({
        show: true,
        title: 'Confirm Stock In',
        message: `Are you sure you want to receive ${purchaseFormData.quantity} ${selectedMaterial?.unit} of ${selectedMaterial?.material_name}? This will add stock to inventory.`,
        onConfirm: async () => {
          setSaving(true);
          try {
            await inventoryService.createInventoryTransaction(purchaseFormData);
            alert('Stock In recorded successfully!');
            setShowPurchaseModal(false);
            await fetchData();
          } catch (error) {
            console.error('Error creating purchase transaction:', error);
            alert('Failed to record Stock In. Please try again.');
          } finally {
            setSaving(false);
            setConfirmModal({ ...confirmModal, show: false });
          }
        },
        confirmText: 'Confirm'
      });
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return `AED ${amount.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <ArrowDownCircle className="w-8 h-8 text-green-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Stock In</h1>
            <p className="text-sm text-gray-500">Record material receipts from vendors</p>
          </div>
        </div>
        <button
          onClick={handleOpenPurchaseModal}
          className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>New Stock In</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by material name, code, or reference number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Purchase Transactions Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Material</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">No stock in transactions found</p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((txn) => (
                  <tr key={txn.inventory_transaction_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(txn.created_at)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{txn.material_name}</div>
                      {txn.brand && <div className="text-gray-500 text-xs">{txn.brand}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {txn.material_code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {txn.quantity} {txn.unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(txn.unit_price)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(txn.total_amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {txn.reference_number || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {txn.notes || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <div className="flex items-center space-x-3">
                <ArrowDownCircle className="w-6 h-6 text-green-600" />
                <h2 className="text-xl font-bold text-gray-900">New Stock In</h2>
              </div>
              <button
                onClick={() => setShowPurchaseModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Material Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Package className="w-4 h-4 inline mr-1" />
                  Material *
                </label>
                <select
                  value={purchaseFormData.inventory_material_id}
                  onChange={(e) => handleMaterialSelect(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                >
                  <option value={0}>Select a material...</option>
                  {allMaterials.map((material) => (
                    <option key={material.inventory_material_id} value={material.inventory_material_id}>
                      {material.material_code} - {material.material_name} {material.brand ? `(${material.brand})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedMaterial && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Current Stock:</span>
                      <span className="ml-2 font-medium">{selectedMaterial.current_stock} {selectedMaterial.unit}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Unit Price:</span>
                      <span className="ml-2 font-medium">AED {selectedMaterial.unit_price}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity Received *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseFormData.quantity || ''}
                  onChange={(e) => handleQuantityChange(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter quantity received"
                  required
                />
                {selectedMaterial && (
                  <p className="text-xs text-gray-500 mt-1">
                    Unit: {selectedMaterial.unit}
                  </p>
                )}
              </div>

              {/* Unit Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  Unit Price (AED) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseFormData.unit_price || ''}
                  onChange={(e) => handleUnitPriceChange(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter unit price"
                  required
                />
              </div>

              {/* Total Amount (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Total Amount (AED)
                </label>
                <input
                  type="text"
                  value={formatCurrency(purchaseFormData.total_amount)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  readOnly
                />
              </div>

              {/* Reference Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4 inline mr-1" />
                  Reference Number (PO/Invoice)
                </label>
                <input
                  type="text"
                  value={purchaseFormData.reference_number || ''}
                  onChange={(e) => setPurchaseFormData({ ...purchaseFormData, reference_number: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter PO or Invoice number"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={purchaseFormData.notes || ''}
                  onChange={(e) => setPurchaseFormData({ ...purchaseFormData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Add any additional notes..."
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowPurchaseModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePurchase}
                disabled={saving}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>Confirm Stock In</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.show && (
        <ConfirmationModal
          show={confirmModal.show}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal({ ...confirmModal, show: false })}
          confirmText={confirmModal.confirmText}
          confirmColor="APPROVE"
        />
      )}
    </div>
  );
};

export default StockInPage;
