import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Package, Truck, RotateCcw, Wrench, Eye,
  Edit2, Trash2, Check, X, AlertTriangle, CheckCircle,
  Building2, RefreshCw, Hash, FileText, ChevronDown, ChevronUp,
  ArrowRight, MapPin
} from 'lucide-react';
import {
  assetService,
  AssetCategory,
  AssetItem,
  AssetMaintenance,
  AssetDashboard,
  TrackingMode,
  AssetCondition,
  DispatchedByProject
} from '../services/assetService';
import { showSuccess, showError } from '@/utils/toastHelper';

interface Project {
  project_id: number;
  project_name: string;
  project_code: string;
}

type ActionMode = 'none' | 'dispatch' | 'return';

const ReturnableAssets: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Data state
  const [dashboard, setDashboard] = useState<AssetDashboard | null>(null);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [items, setItems] = useState<AssetItem[]>([]);
  const [dispatchedAssets, setDispatchedAssets] = useState<DispatchedByProject[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<AssetMaintenance[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // UI state
  const [expandedCategory, setExpandedCategory] = useState<number | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>('none');
  const [selectedCategoryForAction, setSelectedCategoryForAction] = useState<AssetCategory | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory | null>(null);

  // Forms
  const [categoryForm, setCategoryForm] = useState({
    category_name: '', category_code: '', description: '',
    tracking_mode: 'quantity' as TrackingMode, total_quantity: 0
  });
  const [itemForm, setItemForm] = useState({
    category_id: 0, serial_number: '', purchase_date: '',
    purchase_price: 0, current_condition: 'good' as AssetCondition, notes: ''
  });
  const [dispatchForm, setDispatchForm] = useState({
    project_id: 0, quantity: 1, item_ids: [] as number[], notes: ''
  });
  const [returnForm, setReturnForm] = useState({
    project_id: 0, quantity: 1, item_ids: [] as number[],
    condition: 'good' as AssetCondition, damaged_quantity: 0, damage_description: '', notes: ''
  });

  useEffect(() => {
    fetchProjects();
    loadAllData();
  }, []);

  const fetchProjects = async () => {
    try {
      // Fetch projects assigned to the current SE user
      const response = await fetch('/api/projects/assigned-to-me', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        // Extract unique projects from the assigned items
        const projectsData = data.projects || data || [];
        const uniqueProjects: Project[] = [];
        const seenIds = new Set<number>();

        projectsData.forEach((item: any) => {
          const proj = item.project || item;
          if (proj?.project_id && !seenIds.has(proj.project_id)) {
            seenIds.add(proj.project_id);
            uniqueProjects.push({
              project_id: proj.project_id,
              project_name: proj.project_name,
              project_code: proj.project_code
            });
          }
        });

        setProjects(uniqueProjects);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [dashData, catData, itemData, dispData, maintData] = await Promise.all([
        assetService.getDashboard(),
        assetService.getAllCategories(),
        assetService.getAllItems(),
        assetService.getDispatchedAssets(),
        assetService.getPendingMaintenance()
      ]);
      setDashboard(dashData);
      setCategories(catData.categories);
      setItems(itemData.items);
      setDispatchedAssets(dispData.dispatched_by_project);
      setMaintenanceRecords(maintData.maintenance_records);
    } catch (error: any) {
      showError(error.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Category handlers
  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditing && selectedCategory) {
        await assetService.updateCategory(selectedCategory.category_id!, categoryForm);
        showSuccess('Category updated');
      } else {
        await assetService.createCategory(categoryForm);
        showSuccess('Category created');
      }
      setShowCategoryModal(false);
      resetCategoryForm();
      loadAllData();
    } catch (error: any) {
      showError(error.message);
    }
  };

  const handleDeleteCategory = async (cat: AssetCategory) => {
    if (!confirm(`Delete ${cat.category_name}?`)) return;
    try {
      await assetService.deleteCategory(cat.category_id!);
      showSuccess('Deleted');
      loadAllData();
    } catch (error: any) {
      showError(error.message);
    }
  };

  const openEditCategory = (cat: AssetCategory) => {
    setSelectedCategory(cat);
    setCategoryForm({
      category_name: cat.category_name, category_code: cat.category_code,
      description: cat.description || '', tracking_mode: cat.tracking_mode,
      total_quantity: cat.total_quantity
    });
    setIsEditing(true);
    setShowCategoryModal(true);
  };

  const resetCategoryForm = () => {
    setCategoryForm({ category_name: '', category_code: '', description: '', tracking_mode: 'quantity', total_quantity: 0 });
    setSelectedCategory(null);
    setIsEditing(false);
  };

  // Item handlers
  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await assetService.createItem(itemForm);
      showSuccess('Item added');
      setShowItemModal(false);
      setItemForm({ category_id: 0, serial_number: '', purchase_date: '', purchase_price: 0, current_condition: 'good', notes: '' });
      loadAllData();
    } catch (error: any) {
      showError(error.message);
    }
  };

  // Start dispatch action
  const startDispatch = (cat: AssetCategory) => {
    setSelectedCategoryForAction(cat);
    setDispatchForm({ project_id: 0, quantity: 1, item_ids: [], notes: '' });
    setActionMode('dispatch');
  };

  // Start return action
  const startReturn = (cat: AssetCategory, projectId?: number) => {
    setSelectedCategoryForAction(cat);
    setReturnForm({ project_id: projectId || 0, quantity: 1, item_ids: [], condition: 'good', damaged_quantity: 0, damage_description: '', notes: '' });
    setActionMode('return');
  };

  // Dispatch handler
  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryForAction) return;
    try {
      const payload: any = {
        category_id: selectedCategoryForAction.category_id,
        project_id: dispatchForm.project_id,
        notes: dispatchForm.notes
      };
      if (selectedCategoryForAction.tracking_mode === 'individual') {
        payload.item_ids = dispatchForm.item_ids;
      } else {
        payload.quantity = dispatchForm.quantity;
      }

      await assetService.dispatchAsset(payload);
      showSuccess('Dispatched successfully!');
      setActionMode('none');
      setSelectedCategoryForAction(null);
      loadAllData();
    } catch (error: any) {
      showError(error.message);
    }
  };

  // Return handler
  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryForAction) return;
    try {
      const payload: any = {
        category_id: selectedCategoryForAction.category_id,
        project_id: returnForm.project_id,
        condition: returnForm.condition,
        notes: returnForm.notes
      };
      if (selectedCategoryForAction.tracking_mode === 'individual') {
        payload.item_ids = returnForm.item_ids;
      } else {
        payload.quantity = returnForm.quantity;
        if (returnForm.damaged_quantity > 0) {
          payload.damaged_quantity = returnForm.damaged_quantity;
          payload.damage_description = returnForm.damage_description;
        }
      }

      await assetService.returnAsset(payload);
      showSuccess('Returned successfully!');
      setActionMode('none');
      setSelectedCategoryForAction(null);
      loadAllData();
    } catch (error: any) {
      showError(error.message);
    }
  };

  // Maintenance handler
  const handleMaintenanceAction = async (maint: AssetMaintenance, action: 'repair' | 'write_off') => {
    try {
      await assetService.updateMaintenance(maint.maintenance_id!, { action });
      showSuccess(action === 'repair' ? 'Repaired & returned to stock' : 'Written off');
      loadAllData();
    } catch (error: any) {
      showError(error.message);
    }
  };

  // Helper functions
  const getAvailableItems = (catId: number) => items.filter(i => i.category_id === catId && i.current_status === 'available');
  const getDispatchedItemsForProject = (catId: number, projId: number) => items.filter(i => i.category_id === catId && i.current_status === 'dispatched' && i.current_project_id === projId);
  const getCategoryItems = (catId: number) => items.filter(i => i.category_id === catId);

  const getConditionColor = (condition: string) => {
    const colors: Record<string, string> = { good: 'bg-green-100 text-green-700', fair: 'bg-yellow-100 text-yellow-700', poor: 'bg-orange-100 text-orange-700', damaged: 'bg-red-100 text-red-700' };
    return colors[condition] || 'bg-gray-100 text-gray-700';
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = { available: 'bg-green-100 text-green-700', dispatched: 'bg-blue-100 text-blue-700', maintenance: 'bg-orange-100 text-orange-700', retired: 'bg-gray-100 text-gray-700' };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  // Get dispatched info for a category
  const getDispatchedInfoForCategory = (catId: number) => {
    const result: { projectId: number; projectName: string; projectCode: string; quantity: number; items: AssetItem[] }[] = [];

    dispatchedAssets.forEach(proj => {
      const matchingItems = proj.items.filter(item => item.category_id === catId);
      const quantityAsset = proj.quantity_assets.find(qa => qa.category_id === catId);

      if (matchingItems.length > 0 || quantityAsset) {
        result.push({
          projectId: proj.project?.project_id || 0,
          projectName: proj.project?.project_name || '',
          projectCode: proj.project?.project_code || '',
          quantity: quantityAsset?.quantity_dispatched || matchingItems.length,
          items: matchingItems
        });
      }
    });

    return result;
  };

  const cancelAction = () => {
    setActionMode('none');
    setSelectedCategoryForAction(null);
  };

  // ==================== RENDER ACTION PANEL ====================
  const renderActionPanel = () => {
    if (actionMode === 'none' || !selectedCategoryForAction) return null;

    const cat = selectedCategoryForAction;
    const availableItems = getAvailableItems(cat.category_id!);
    const dispatchedInfo = getDispatchedInfoForCategory(cat.category_id!);

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className={`p-4 text-white ${actionMode === 'dispatch' ? 'bg-gradient-to-r from-orange-500 to-orange-600' : 'bg-gradient-to-r from-green-500 to-green-600'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {actionMode === 'dispatch' ? <Truck className="w-6 h-6" /> : <RotateCcw className="w-6 h-6" />}
                <div>
                  <h2 className="text-lg font-bold">{actionMode === 'dispatch' ? 'Dispatch' : 'Return'} {cat.category_name}</h2>
                  <p className="text-sm opacity-80">{cat.category_code} • {cat.tracking_mode === 'individual' ? 'Individual Tracking' : 'Quantity Tracking'}</p>
                </div>
              </div>
              <button onClick={cancelAction} className="p-1 hover:bg-white/20 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={actionMode === 'dispatch' ? handleDispatch : handleReturn} className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
            {actionMode === 'dispatch' ? (
              <>
                {/* Dispatch Form */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Send to Project</label>
                  <select value={dispatchForm.project_id} onChange={e => setDispatchForm({ ...dispatchForm, project_id: parseInt(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-orange-500" required>
                    <option value={0}>Select project...</option>
                    {projects.map(p => (
                      <option key={p.project_id} value={p.project_id}>{p.project_name} ({p.project_code})</option>
                    ))}
                  </select>
                </div>

                {cat.tracking_mode === 'individual' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Items ({dispatchForm.item_ids.length} selected)</label>
                    <div className="border rounded-lg max-h-40 overflow-y-auto">
                      {availableItems.length === 0 ? (
                        <p className="p-3 text-gray-500 text-center text-sm">No available items</p>
                      ) : (
                        availableItems.map(item => (
                          <label key={item.item_id} className="flex items-center p-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0">
                            <input type="checkbox" checked={dispatchForm.item_ids.includes(item.item_id!)}
                              onChange={e => {
                                if (e.target.checked) setDispatchForm({ ...dispatchForm, item_ids: [...dispatchForm.item_ids, item.item_id!] });
                                else setDispatchForm({ ...dispatchForm, item_ids: dispatchForm.item_ids.filter(id => id !== item.item_id) });
                              }}
                              className="w-4 h-4 text-orange-600 rounded mr-2" />
                            <span className="font-medium text-sm">{item.item_code}</span>
                            <span className={`ml-auto px-2 py-0.5 rounded text-xs ${getConditionColor(item.current_condition)}`}>{item.current_condition}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity (max: {cat.available_quantity})</label>
                    <input type="number" min={1} max={cat.available_quantity} value={dispatchForm.quantity}
                      onChange={e => setDispatchForm({ ...dispatchForm, quantity: parseInt(e.target.value) || 1 })}
                      className="w-full border rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-orange-500" required />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <textarea value={dispatchForm.notes} onChange={e => setDispatchForm({ ...dispatchForm, notes: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2" rows={2} placeholder="Any special notes..." />
                </div>
              </>
            ) : (
              <>
                {/* Return Form */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Return from Project</label>
                  <select value={returnForm.project_id} onChange={e => setReturnForm({ ...returnForm, project_id: parseInt(e.target.value), item_ids: [] })}
                    className="w-full border rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-green-500" required>
                    <option value={0}>Select project...</option>
                    {dispatchedInfo.map(info => (
                      <option key={info.projectId} value={info.projectId}>{info.projectName} ({info.quantity} units)</option>
                    ))}
                  </select>
                </div>

                {cat.tracking_mode === 'individual' && returnForm.project_id > 0 ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Items to Return</label>
                    <div className="border rounded-lg max-h-40 overflow-y-auto">
                      {getDispatchedItemsForProject(cat.category_id!, returnForm.project_id).map(item => (
                        <label key={item.item_id} className="flex items-center p-2 hover:bg-gray-50 cursor-pointer border-b last:border-b-0">
                          <input type="checkbox" checked={returnForm.item_ids.includes(item.item_id!)}
                            onChange={e => {
                              if (e.target.checked) setReturnForm({ ...returnForm, item_ids: [...returnForm.item_ids, item.item_id!] });
                              else setReturnForm({ ...returnForm, item_ids: returnForm.item_ids.filter(id => id !== item.item_id) });
                            }}
                            className="w-4 h-4 text-green-600 rounded mr-2" />
                          <span className="font-medium text-sm">{item.item_code}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : cat.tracking_mode === 'quantity' && returnForm.project_id > 0 ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to Return</label>
                    <input type="number" min={1} value={returnForm.quantity}
                      onChange={e => setReturnForm({ ...returnForm, quantity: parseInt(e.target.value) || 1 })}
                      className="w-full border rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-green-500" required />
                  </div>
                ) : null}

                {returnForm.project_id > 0 && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Condition on Return</label>
                      <div className="grid grid-cols-4 gap-2">
                        {(['good', 'fair', 'poor', 'damaged'] as AssetCondition[]).map(cond => (
                          <button key={cond} type="button" onClick={() => setReturnForm({ ...returnForm, condition: cond })}
                            className={`py-2 px-2 rounded-lg border-2 text-xs font-medium capitalize transition-colors ${returnForm.condition === cond ? getConditionColor(cond) + ' border-current' : 'border-gray-200 hover:border-gray-300'}`}>
                            {cond}
                          </button>
                        ))}
                      </div>
                    </div>

                    {(returnForm.condition === 'damaged' || returnForm.condition === 'poor') && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                        <p className="text-sm font-medium text-red-800 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" /> Damage Report
                        </p>
                        {cat.tracking_mode === 'quantity' && (
                          <div>
                            <label className="text-xs text-gray-700">How many damaged?</label>
                            <input type="number" min={0} max={returnForm.quantity} value={returnForm.damaged_quantity}
                              onChange={e => setReturnForm({ ...returnForm, damaged_quantity: parseInt(e.target.value) || 0 })}
                              className="w-full border rounded px-2 py-1 text-sm mt-1" />
                          </div>
                        )}
                        <div>
                          <label className="text-xs text-gray-700">Describe damage</label>
                          <textarea value={returnForm.damage_description}
                            onChange={e => setReturnForm({ ...returnForm, damage_description: e.target.value })}
                            className="w-full border rounded px-2 py-1 text-sm mt-1" rows={2} />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* Submit */}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={cancelAction} className="flex-1 px-4 py-2.5 border rounded-lg hover:bg-gray-50 font-medium">
                Cancel
              </button>
              <button type="submit"
                disabled={actionMode === 'dispatch' ? (!dispatchForm.project_id || (cat.tracking_mode === 'individual' && dispatchForm.item_ids.length === 0)) : !returnForm.project_id}
                className={`flex-1 px-4 py-2.5 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${actionMode === 'dispatch' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'}`}>
                {actionMode === 'dispatch' ? <><Truck className="w-4 h-4" /> Dispatch</> : <><RotateCcw className="w-4 h-4" /> Return</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // ==================== RENDER CATEGORY MODAL ====================
  const renderCategoryModal = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold">{isEditing ? 'Edit Asset Type' : 'Add Asset Type'}</h3>
          <button onClick={() => { setShowCategoryModal(false); resetCategoryForm(); }} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleCategorySubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" value={categoryForm.category_name} onChange={e => setCategoryForm({ ...categoryForm, category_name: e.target.value })}
              className="w-full border rounded-lg px-3 py-2" placeholder="e.g., Ladder, Table" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code (auto if empty)</label>
            <input type="text" value={categoryForm.category_code} onChange={e => setCategoryForm({ ...categoryForm, category_code: e.target.value.toUpperCase() })}
              className="w-full border rounded-lg px-3 py-2" placeholder="e.g., LAD, TBL" disabled={isEditing} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tracking Mode *</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCategoryForm({ ...categoryForm, tracking_mode: 'quantity' })}
                className={`p-3 rounded-lg border-2 text-left ${categoryForm.tracking_mode === 'quantity' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                disabled={isEditing}>
                <Hash className="w-5 h-5 text-blue-600 mb-1" />
                <p className="font-medium text-sm">Quantity</p>
                <p className="text-xs text-gray-500">Track by count</p>
              </button>
              <button type="button" onClick={() => setCategoryForm({ ...categoryForm, tracking_mode: 'individual' })}
                className={`p-3 rounded-lg border-2 text-left ${categoryForm.tracking_mode === 'individual' ? 'border-purple-500 bg-purple-50' : 'border-gray-200'}`}
                disabled={isEditing}>
                <FileText className="w-5 h-5 text-purple-600 mb-1" />
                <p className="font-medium text-sm">Individual</p>
                <p className="text-xs text-gray-500">Track each item</p>
              </button>
            </div>
          </div>
          {categoryForm.tracking_mode === 'quantity' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Quantity</label>
              <input type="number" min={0} value={categoryForm.total_quantity} onChange={e => setCategoryForm({ ...categoryForm, total_quantity: parseInt(e.target.value) || 0 })}
                className="w-full border rounded-lg px-3 py-2" />
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => { setShowCategoryModal(false); resetCategoryForm(); }}
              className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {isEditing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // ==================== RENDER ITEM MODAL ====================
  const renderItemModal = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold">Add Individual Item</h3>
          <button onClick={() => setShowItemModal(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleItemSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Asset Type *</label>
            <select value={itemForm.category_id} onChange={e => setItemForm({ ...itemForm, category_id: parseInt(e.target.value) })}
              className="w-full border rounded-lg px-3 py-2" required>
              <option value={0}>Select type...</option>
              {categories.filter(c => c.tracking_mode === 'individual').map(c => (
                <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
            <input type="text" value={itemForm.serial_number} onChange={e => setItemForm({ ...itemForm, serial_number: e.target.value })}
              className="w-full border rounded-lg px-3 py-2" placeholder="Manufacturer serial" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
              <input type="date" value={itemForm.purchase_date} onChange={e => setItemForm({ ...itemForm, purchase_date: e.target.value })}
                className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price</label>
              <input type="number" min={0} value={itemForm.purchase_price} onChange={e => setItemForm({ ...itemForm, purchase_price: parseFloat(e.target.value) || 0 })}
                className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
            <select value={itemForm.current_condition} onChange={e => setItemForm({ ...itemForm, current_condition: e.target.value as AssetCondition })}
              className="w-full border rounded-lg px-3 py-2">
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setShowItemModal(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Add Item</button>
          </div>
        </form>
      </div>
    </div>
  );

  // ==================== MAIN RENDER ====================
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Returnable Assets</h1>
            <p className="text-sm text-gray-500">Manage reusable equipment lifecycle</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border rounded-lg text-sm w-48 focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={() => { resetCategoryForm(); setShowCategoryModal(true); }}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              <Plus className="w-4 h-4" /> Add Type
            </button>
            {categories.some(c => c.tracking_mode === 'individual') && (
              <button onClick={() => setShowItemModal(true)}
                className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            )}
            <button onClick={loadAllData} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Quick Summary Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-3 border shadow-sm">
            <div className="flex items-center gap-2">
              <div className="bg-blue-100 p-2 rounded-lg"><Package className="w-4 h-4 text-blue-600" /></div>
              <div>
                <p className="text-lg font-bold text-gray-900">{dashboard?.summary.total_categories || 0}</p>
                <p className="text-xs text-gray-500">Asset Types</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-3 border shadow-sm">
            <div className="flex items-center gap-2">
              <div className="bg-green-100 p-2 rounded-lg"><CheckCircle className="w-4 h-4 text-green-600" /></div>
              <div>
                <p className="text-lg font-bold text-green-600">{dashboard?.summary.total_available || 0}</p>
                <p className="text-xs text-gray-500">Available</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-3 border shadow-sm">
            <div className="flex items-center gap-2">
              <div className="bg-orange-100 p-2 rounded-lg"><Truck className="w-4 h-4 text-orange-600" /></div>
              <div>
                <p className="text-lg font-bold text-orange-600">{dashboard?.summary.total_dispatched || 0}</p>
                <p className="text-xs text-gray-500">At Sites</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-3 border shadow-sm">
            <div className="flex items-center gap-2">
              <div className="bg-red-100 p-2 rounded-lg"><Wrench className="w-4 h-4 text-red-600" /></div>
              <div>
                <p className="text-lg font-bold text-red-600">{dashboard?.summary.pending_maintenance || 0}</p>
                <p className="text-xs text-gray-500">In Repair</p>
              </div>
            </div>
          </div>
        </div>

        {/* Asset Categories - Flow View */}
        <div className="space-y-3">
          {categories.filter(c => c.category_name.toLowerCase().includes(searchTerm.toLowerCase())).map(cat => {
            const isExpanded = expandedCategory === cat.category_id;
            const dispatchedInfo = getDispatchedInfoForCategory(cat.category_id!);
            const categoryItems = getCategoryItems(cat.category_id!);
            const catMaintenance = maintenanceRecords.filter(m => m.category_id === cat.category_id);

            return (
              <div key={cat.category_id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                {/* Category Header */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-gray-100 p-2.5 rounded-xl">
                        <Package className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{cat.category_name}</h3>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${cat.tracking_mode === 'individual' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {cat.tracking_mode === 'individual' ? 'Individual' : 'Quantity'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">{cat.category_code}</p>
                      </div>
                    </div>

                    {/* Flow Status Badges */}
                    <div className="flex items-center gap-2">
                      {/* Available */}
                      <div className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="font-bold text-green-700">{cat.available_quantity}</span>
                        <span className="text-xs text-green-600">ready</span>
                      </div>

                      <ArrowRight className="w-4 h-4 text-gray-300" />

                      {/* Dispatched */}
                      <div className="flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                        <Truck className="w-4 h-4 text-orange-600" />
                        <span className="font-bold text-orange-700">{cat.dispatched_quantity || 0}</span>
                        <span className="text-xs text-orange-600">out</span>
                      </div>

                      {catMaintenance.length > 0 && (
                        <>
                          <ArrowRight className="w-4 h-4 text-gray-300" />
                          <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                            <Wrench className="w-4 h-4 text-red-600" />
                            <span className="font-bold text-red-700">{catMaintenance.length}</span>
                            <span className="text-xs text-red-600">repair</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-2 mt-3">
                    {cat.available_quantity > 0 && (
                      <button onClick={() => startDispatch(cat)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-200 transition-colors">
                        <Truck className="w-4 h-4" /> Dispatch
                      </button>
                    )}
                    {(cat.dispatched_quantity || 0) > 0 && (
                      <button onClick={() => startReturn(cat)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors">
                        <RotateCcw className="w-4 h-4" /> Return
                      </button>
                    )}
                    <button onClick={() => setExpandedCategory(isExpanded ? null : cat.category_id!)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors ml-auto">
                      <Eye className="w-4 h-4" /> {isExpanded ? 'Hide' : 'Details'}
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button onClick={() => openEditCategory(cat)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteCategory(cat)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t bg-gray-50 p-4 space-y-4">
                    {/* Individual Items (if applicable) */}
                    {cat.tracking_mode === 'individual' && categoryItems.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                          <Package className="w-4 h-4" /> Individual Items ({categoryItems.length})
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {categoryItems.map(item => (
                            <div key={item.item_id} className="bg-white rounded-lg p-2 border text-sm">
                              <div className="font-medium">{item.item_code}</div>
                              <div className="flex items-center gap-1 mt-1">
                                <span className={`px-1.5 py-0.5 rounded text-xs ${getConditionColor(item.current_condition)}`}>{item.current_condition}</span>
                                <span className={`px-1.5 py-0.5 rounded text-xs ${getStatusColor(item.current_status)}`}>{item.current_status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dispatched to Projects */}
                    {dispatchedInfo.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                          <MapPin className="w-4 h-4" /> At Project Sites
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {dispatchedInfo.map((info, idx) => (
                            <div key={idx} className="bg-white rounded-lg p-3 border flex items-center justify-between">
                              <div>
                                <p className="font-medium text-sm">{info.projectName}</p>
                                <p className="text-xs text-gray-500">{info.projectCode} • {info.quantity} units</p>
                              </div>
                              <button onClick={() => startReturn(cat, info.projectId)}
                                className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200">
                                Return
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Maintenance Items */}
                    {catMaintenance.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                          <Wrench className="w-4 h-4" /> In Maintenance
                        </h4>
                        <div className="space-y-2">
                          {catMaintenance.map(maint => (
                            <div key={maint.maintenance_id} className="bg-white rounded-lg p-3 border flex items-center justify-between">
                              <div>
                                <p className="font-medium text-sm">{maint.item_code || `Qty: ${maint.quantity}`}</p>
                                <p className="text-xs text-gray-500">{maint.issue_description}</p>
                              </div>
                              <div className="flex gap-1">
                                <button onClick={() => handleMaintenanceAction(maint, 'repair')}
                                  className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
                                  <Check className="w-3 h-3 inline mr-1" />Repaired
                                </button>
                                <button onClick={() => handleMaintenanceAction(maint, 'write_off')}
                                  className="px-2 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700">
                                  <X className="w-3 h-3 inline mr-1" />Write Off
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {categories.length === 0 && (
            <div className="bg-white rounded-xl border p-12 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No asset types yet</p>
              <button onClick={() => { resetCategoryForm(); setShowCategoryModal(true); }}
                className="mt-4 text-blue-600 hover:underline text-sm">Add your first asset type</button>
            </div>
          )}
        </div>

        {/* Global Maintenance Queue (if any pending) */}
        {maintenanceRecords.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <h3 className="font-semibold text-red-800 flex items-center gap-2 mb-3">
              <Wrench className="w-5 h-5" /> Pending Repairs ({maintenanceRecords.length})
            </h3>
            <div className="grid gap-2">
              {maintenanceRecords.slice(0, 3).map(maint => (
                <div key={maint.maintenance_id} className="bg-white rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{maint.category_name} {maint.item_code && `(${maint.item_code})`}</p>
                    <p className="text-xs text-gray-500">{maint.issue_description}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleMaintenanceAction(maint, 'repair')}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Repaired
                    </button>
                    <button onClick={() => handleMaintenanceAction(maint, 'write_off')}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 flex items-center gap-1">
                      <X className="w-3 h-3" /> Write Off
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {renderActionPanel()}
      {showCategoryModal && renderCategoryModal()}
      {showItemModal && renderItemModal()}
    </div>
  );
};

export default ReturnableAssets;
