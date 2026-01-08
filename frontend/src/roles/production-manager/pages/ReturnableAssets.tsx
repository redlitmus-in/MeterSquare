import React, { useState, useEffect } from 'react';
import { Search, Package, X, RefreshCw, AlertTriangle } from 'lucide-react';
import { apiClient } from '@/api/config';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { assetService, AssetCategory, AssetDashboard } from '../services/assetService';
import { showSuccess, showError } from '@/utils/toastHelper';


const ReturnableAssets: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Data state
  const [dashboard, setDashboard] = useState<AssetDashboard | null>(null);
  const [categories, setCategories] = useState<AssetCategory[]>([]);

  // Disposal modal state
  const [showDisposalModal, setShowDisposalModal] = useState(false);
  const [disposalCategory, setDisposalCategory] = useState<AssetCategory | null>(null);
  const [disposalQuantity, setDisposalQuantity] = useState(1);
  const [disposalReason, setDisposalReason] = useState('');
  const [disposalNotes, setDisposalNotes] = useState('');
  const [submittingDisposal, setSubmittingDisposal] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [dashData, catData] = await Promise.all([
        assetService.getDashboard(),
        assetService.getAllCategories()
      ]);
      setDashboard(dashData);
      setCategories(catData.categories);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load data';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  // Disposal handlers
  const openDisposalModal = (cat: AssetCategory) => {
    setDisposalCategory(cat);
    setDisposalQuantity(1);
    setDisposalReason('');
    setDisposalNotes('');
    setShowDisposalModal(true);
  };

  const handleDisposalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disposalCategory) return;

    if (disposalQuantity > disposalCategory.available_quantity) {
      showError('Disposal quantity cannot exceed available quantity');
      return;
    }

    if (!disposalReason.trim()) {
      showError('Please provide a reason for disposal');
      return;
    }

    setSubmittingDisposal(true);
    try {
      await apiClient.post('/assets/disposal', {
        category_id: disposalCategory.category_id,
        quantity: disposalQuantity,
        disposal_reason: disposalReason.trim(),
        notes: disposalNotes.trim()
      });
      showSuccess(`Disposal request submitted for ${disposalQuantity} ${disposalCategory.category_name}`);
      setShowDisposalModal(false);
      loadAllData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to submit disposal request';
      showError(message);
    } finally {
      setSubmittingDisposal(false);
    }
  };

  // Filter categories based on search
  const filteredCategories = categories.filter(c =>
    c.category_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.category_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ==================== RENDER DISPOSAL MODAL ====================
  const renderDisposalModal = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-4 border-b flex justify-between items-center bg-red-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h3 className="text-lg font-semibold text-gray-900">Request Disposal</h3>
          </div>
          <button onClick={() => setShowDisposalModal(false)} className="p-1 hover:bg-red-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleDisposalSubmit} className="p-4 space-y-4">
          {/* Asset Info */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-500">Asset Type</p>
            <p className="font-semibold text-gray-900">{disposalCategory?.category_name}</p>
            <p className="text-xs text-gray-500 mt-1">
              Available: {disposalCategory?.available_quantity} | Total: {disposalCategory?.total_quantity}
            </p>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity to Dispose *
            </label>
            <input
              type="number"
              min={1}
              max={disposalCategory?.available_quantity || 1}
              value={disposalQuantity}
              onChange={e => setDisposalQuantity(parseInt(e.target.value) || 1)}
              className="w-full border rounded-lg px-3 py-2"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Max: {disposalCategory?.available_quantity}
            </p>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Disposal *
            </label>
            <select
              value={disposalReason}
              onChange={e => setDisposalReason(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
              required
            >
              <option value="">Select reason...</option>
              <option value="damaged_beyond_repair">Damaged Beyond Repair</option>
              <option value="obsolete">Obsolete / Outdated</option>
              <option value="end_of_life">End of Life</option>
              <option value="lost">Lost / Missing</option>
              <option value="safety_hazard">Safety Hazard</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Notes
            </label>
            <textarea
              value={disposalNotes}
              onChange={e => setDisposalNotes(e.target.value)}
              placeholder="Provide any additional details..."
              rows={3}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <p className="font-medium">This will create a disposal request</p>
            <p className="text-xs mt-1">The request will be sent to TD for approval before assets are disposed.</p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowDisposalModal(false)}
              className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingDisposal || !disposalReason}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submittingDisposal ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // ==================== MAIN RENDER ====================
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ModernLoadingSpinners size="sm" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Asset Catalog</h1>
            <p className="text-sm text-gray-500">View asset inventory details</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border rounded-lg text-sm w-48 focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={loadAllData} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Asset Table */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Asset Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tracking</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Available</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Dispatched</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Disposal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">
                        {searchTerm ? 'No assets match your search' : 'No asset types available'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map(cat => (
                    <tr key={cat.category_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-gray-100 p-2 rounded-lg">
                            <Package className="w-4 h-4 text-gray-600" />
                          </div>
                          <span className="font-medium text-gray-900">{cat.category_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{cat.category_code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          cat.tracking_mode === 'individual' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {cat.tracking_mode === 'individual' ? 'Individual' : 'Quantity'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-lg font-bold ${cat.available_quantity > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {cat.available_quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-lg font-bold text-orange-600">
                          {cat.dispatched_quantity || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-lg font-bold text-gray-700">
                          {cat.total_quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openDisposalModal(cat)}
                          disabled={cat.available_quantity === 0}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Request Disposal"
                        >
                          <AlertTriangle className="w-4 h-4" />
                          Dispose
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Summary Footer */}
          {filteredCategories.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {filteredCategories.length} asset type{filteredCategories.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-green-600 font-medium">
                  {dashboard?.summary.total_available || 0} Available
                </span>
                <span className="text-orange-600 font-medium">
                  {dashboard?.summary.total_dispatched || 0} Dispatched
                </span>
                <span className="text-gray-700 font-medium">
                  {categories.reduce((sum, cat) => sum + cat.total_quantity, 0)} Total
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disposal Modal */}
      {showDisposalModal && disposalCategory && renderDisposalModal()}
    </div>
  );
};

export default ReturnableAssets;
