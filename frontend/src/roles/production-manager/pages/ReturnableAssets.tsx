import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Package, Truck, RotateCcw, Wrench, Eye,
  Edit2, Trash2, Check, X, AlertTriangle, CheckCircle,
  RefreshCw, Hash, FileText, ChevronDown, ChevronUp,
  ArrowRight, MapPin, Clock, User, Calendar, History
} from 'lucide-react';
import { apiClient } from '@/api/config';
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

// ==================== CONSTANTS ====================

const CONDITION_COLORS: Record<string, string> = {
  good: 'bg-green-100 text-green-700',
  fair: 'bg-yellow-100 text-yellow-700',
  poor: 'bg-orange-100 text-orange-700',
  damaged: 'bg-red-100 text-red-700',
  default: 'bg-gray-100 text-gray-700'
};

const STATUS_COLORS: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  dispatched: 'bg-blue-100 text-blue-700',
  maintenance: 'bg-orange-100 text-orange-700',
  retired: 'bg-gray-100 text-gray-700',
  default: 'bg-gray-100 text-gray-700'
};

const VALID_CONDITIONS: AssetCondition[] = ['good', 'fair', 'poor', 'damaged'];
const MAX_PENDING_REPAIRS_DISPLAY = 3;

// ==================== INTERFACES ====================

interface Project {
  project_id: number;
  project_name: string;
  project_code: string;
}

interface AssetMovement {
  movement_id: number;
  category_id: number;
  category_name: string;
  category_code: string;
  item_id?: number;
  item_code?: string;
  movement_type: 'DISPATCH' | 'RETURN';
  project_id: number;
  quantity: number;
  condition_before?: string;
  condition_after?: string;
  dispatched_by?: string;
  dispatched_at?: string;
  returned_by?: string;
  returned_at?: string;
  notes?: string;
  created_at: string;
  project_name?: string;
  project_code?: string;
}

interface ReturnRequest {
  request_id: number;
  tracking_code: string;
  category_id: number;
  category_name: string;
  category_code: string;
  project_id: number;
  quantity: number;
  se_condition_assessment: string;
  se_notes?: string;
  se_damage_description?: string;
  status: string;
  requested_by: string;
  requested_by_id: number;
  requested_at: string;
  project_details?: {
    project_name: string;
    project_code: string;
  };
  dispatch_history?: Array<{
    dispatched_at: string;
    dispatched_by: string;
    quantity: number;
  }>;
}

type ActionMode = 'none' | 'dispatch';

// ==================== HELPER FUNCTIONS ====================

const getConditionColor = (condition: string): string => {
  return CONDITION_COLORS[condition] || CONDITION_COLORS.default;
};

const getStatusColor = (status: string): string => {
  return STATUS_COLORS[status] || STATUS_COLORS.default;
};


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
  const [pendingReturnRequests, setPendingReturnRequests] = useState<ReturnRequest[]>([]);
  const [processingRequest, setProcessingRequest] = useState<number | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [selectedReturnRequest, setSelectedReturnRequest] = useState<ReturnRequest | null>(null);
  const [processForm, setProcessForm] = useState({
    pm_condition_assessment: 'good',
    pm_action: 'return_to_stock',
    pm_notes: ''
  });

  // UI state
  const [expandedCategory, setExpandedCategory] = useState<number | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>('none');
  const [selectedCategoryForAction, setSelectedCategoryForAction] = useState<AssetCategory | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<AssetCategory | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedCategoryForHistory, setSelectedCategoryForHistory] = useState<AssetCategory | null>(null);
  const [movements, setMovements] = useState<AssetMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Forms
  const [categoryForm, setCategoryForm] = useState({
    category_name: '', category_code: '', description: '',
    tracking_mode: 'quantity' as TrackingMode, total_quantity: 0
  });
  const [dispatchForm, setDispatchForm] = useState({
    project_id: 0, quantity: 1, item_ids: [] as number[], notes: ''
  });

  const fetchProjects = async () => {
    try {
      // Fetch projects with SE assigned - use all_project and filter by site_supervisors
      const response = await fetch('/api/all_project?per_page=100', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
      });
      if (response.ok) {
        const data = await response.json();
        const projectsData = data.projects || [];

        // Filter only projects with Site Engineer/Supervisor assigned
        // Check site_supervisors array (enriched field from API)
        const uniqueProjects: Project[] = projectsData
          .filter((proj: { project_id?: number; site_supervisors?: Array<{ user_id: number }> }) =>
            proj?.project_id && proj?.site_supervisors && proj.site_supervisors.length > 0
          )
          .map((proj: { project_id: number; project_name?: string; project_code?: string }) => ({
            project_id: proj.project_id,
            project_name: proj.project_name || '',
            project_code: proj.project_code || ''
          }));

        setProjects(uniqueProjects);
      } else {
        console.error('API Error:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Fetch Error:', error);
      showError('Failed to fetch projects');
    }
  };

  const fetchPendingReturnRequests = useCallback(async () => {
    try {
      const response = await apiClient.get('/assets/return-requests?status=pending');
      setPendingReturnRequests(response.data.return_requests || []);
    } catch (error) {
      console.error('Error fetching return requests:', error);
    }
  }, []);

  const fetchMovements = async (categoryId: number) => {
    setLoadingHistory(true);
    try {
      const response = await apiClient.get(`/assets/movements?category_id=${categoryId}&limit=50`);
      const movementsData = response.data.movements || [];

      // Fetch all projects for lookup
      const projectMap: Record<number, { project_name: string; project_code: string }> = {};

      try {
        const allProjectsResponse = await fetch('/api/all_project?per_page=500', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        });
        if (allProjectsResponse.ok) {
          const allProjectsData = await allProjectsResponse.json();
          const allProjects = allProjectsData.projects || [];
          allProjects.forEach((p: { project_id: number; project_name: string; project_code: string }) => {
            projectMap[p.project_id] = { project_name: p.project_name, project_code: p.project_code };
          });
        }
      } catch (err) {
        console.error('Error fetching all projects:', err);
      }

      // Enrich movements with project names
      const enrichedMovements = movementsData.map((m: AssetMovement) => ({
        ...m,
        project_name: projectMap[m.project_id]?.project_name || `Project #${m.project_id}`,
        project_code: projectMap[m.project_id]?.project_code || ''
      }));

      setMovements(enrichedMovements);
    } catch (error) {
      console.error('Error fetching movements:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const openHistoryModal = (cat: AssetCategory) => {
    setSelectedCategoryForHistory(cat);
    setShowHistoryModal(true);
    fetchMovements(cat.category_id!);
  };

  useEffect(() => {
    fetchProjects();
    loadAllData();
    fetchPendingReturnRequests();
  }, [fetchPendingReturnRequests]);

  const handleProcessReturnRequest = async () => {
    if (!selectedReturnRequest) return;

    try {
      setProcessingRequest(selectedReturnRequest.request_id);
      await apiClient.put(`/assets/return-requests/${selectedReturnRequest.request_id}/process`, {
        pm_condition_assessment: processForm.pm_condition_assessment,
        pm_action: processForm.pm_action,
        pm_notes: processForm.pm_notes
      });

      showSuccess(`Return processed successfully! Action: ${processForm.pm_action.replace(/_/g, ' ')}`);
      setShowProcessModal(false);
      setSelectedReturnRequest(null);
      setProcessForm({ pm_condition_assessment: 'good', pm_action: 'return_to_stock', pm_notes: '' });

      // Refresh data
      fetchPendingReturnRequests();
      loadAllData();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } };
      showError(err.response?.data?.error || 'Failed to process return request');
    } finally {
      setProcessingRequest(null);
    }
  };

  const openProcessModal = (req: ReturnRequest) => {
    setSelectedReturnRequest(req);
    setProcessForm({
      pm_condition_assessment: req.se_condition_assessment,
      pm_action: req.se_condition_assessment === 'good' ? 'return_to_stock' :
                 req.se_condition_assessment === 'damaged' ? 'send_to_maintenance' : 'return_to_stock',
      pm_notes: ''
    });
    setShowProcessModal(true);
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

  // Start dispatch action
  const startDispatch = (cat: AssetCategory) => {
    setSelectedCategoryForAction(cat);
    setDispatchForm({ project_id: 0, quantity: 1, item_ids: [], notes: '' });
    setActionMode('dispatch');
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
  const getAvailableItems = useCallback((catId: number) =>
    items.filter(i => i.category_id === catId && i.current_status === 'available'), [items]);


  const getCategoryItems = useCallback((catId: number) =>
    items.filter(i => i.category_id === catId), [items]);

  // Get dispatched info for a category
  const getDispatchedInfoForCategory = (catId: number) => {
    const result: {
      projectId: number;
      projectName: string;
      projectCode: string;
      quantity: number;
      items: AssetItem[];
      dispatched_at?: string;
      dispatched_by?: string;
      received_at?: string;
      received_by?: string;
      is_received?: boolean;
    }[] = [];

    dispatchedAssets.forEach(proj => {
      const matchingItems = proj.items.filter(item => item.category_id === catId);
      const quantityAsset = proj.quantity_assets.find(qa => qa.category_id === catId);

      if (matchingItems.length > 0 || quantityAsset) {
        result.push({
          projectId: proj.project?.project_id || 0,
          projectName: proj.project?.project_name || '',
          projectCode: proj.project?.project_code || '',
          quantity: quantityAsset?.quantity_dispatched || matchingItems.length,
          items: matchingItems,
          dispatched_at: quantityAsset?.dispatched_at,
          dispatched_by: quantityAsset?.dispatched_by,
          received_at: quantityAsset?.received_at,
          received_by: quantityAsset?.received_by,
          is_received: quantityAsset?.is_received
        });
      }
    });

    return result;
  };

  const cancelAction = () => {
    setActionMode('none');
    setSelectedCategoryForAction(null);
  };

  // ==================== RENDER DISPATCH PANEL ====================
  const renderDispatchPanel = () => {
    if (actionMode !== 'dispatch' || !selectedCategoryForAction) return null;

    const cat = selectedCategoryForAction;
    const availableItems = getAvailableItems(cat.category_id!);

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="p-4 text-white bg-gradient-to-r from-orange-500 to-orange-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Truck className="w-6 h-6" />
                <div>
                  <h2 className="text-lg font-bold">Dispatch {cat.category_name}</h2>
                  <p className="text-sm opacity-80">{cat.category_code} • {cat.tracking_mode === 'individual' ? 'Individual Tracking' : 'Quantity Tracking'}</p>
                </div>
              </div>
              <button onClick={cancelAction} className="p-1 hover:bg-white/20 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleDispatch} className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
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

            {/* Submit */}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={cancelAction} className="flex-1 px-4 py-2.5 border rounded-lg hover:bg-gray-50 font-medium">
                Cancel
              </button>
              <button type="submit"
                disabled={!dispatchForm.project_id || (cat.tracking_mode === 'individual' && dispatchForm.item_ids.length === 0)}
                className="flex-1 px-4 py-2.5 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700">
                <Truck className="w-4 h-4" /> Dispatch
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
            <button onClick={loadAllData} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Quick Summary Stats */}
        <div className="grid grid-cols-5 gap-3">
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
          <div className="bg-white rounded-xl p-3 border shadow-sm">
            <div className="flex items-center gap-2">
              <div className="bg-yellow-100 p-2 rounded-lg"><Clock className="w-4 h-4 text-yellow-600" /></div>
              <div>
                <p className="text-lg font-bold text-yellow-600">{pendingReturnRequests.length}</p>
                <p className="text-xs text-gray-500">Pending Returns</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Return Requests from SE */}
        {pendingReturnRequests.length > 0 && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-yellow-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-600" />
                <h3 className="font-semibold text-gray-900">Pending Return Requests</h3>
                <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-medium">
                  {pendingReturnRequests.length} pending
                </span>
              </div>
              <button onClick={fetchPendingReturnRequests} className="p-1.5 hover:bg-yellow-100 rounded-lg">
                <RefreshCw className="w-4 h-4 text-yellow-600" />
              </button>
            </div>
            <div className="divide-y">
              {pendingReturnRequests.map(req => (
                <div key={req.request_id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                          {req.tracking_code}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getConditionColor(req.se_condition_assessment)}`}>
                          {req.se_condition_assessment}
                        </span>
                      </div>
                      <h4 className="font-medium text-gray-900">{req.category_name}</h4>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {req.project_details?.project_name || `Project #${req.project_id}`}
                        </span>
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {req.quantity} unit(s)
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {req.requested_by}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(req.requested_at).toLocaleDateString()} {new Date(req.requested_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      {req.se_damage_description && (
                        <p className="text-sm text-orange-600 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {req.se_damage_description}
                        </p>
                      )}
                      {req.se_notes && (
                        <p className="text-sm text-gray-500 mt-1 italic">Note: {req.se_notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => openProcessModal(req)}
                      disabled={processingRequest === req.request_id}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-1 disabled:opacity-50"
                    >
                      {processingRequest === req.request_id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Process
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
                    <button onClick={() => startDispatch(cat)}
                      disabled={cat.available_quantity === 0}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${cat.available_quantity > 0 ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                      <Truck className="w-4 h-4" /> Dispatch
                    </button>
                    <button onClick={() => openHistoryModal(cat)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-indigo-100 text-indigo-700 hover:bg-indigo-200">
                      <History className="w-4 h-4" /> History
                    </button>
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
                            <div key={idx} className="bg-white rounded-lg p-3 border">
                              <div className="mb-2">
                                <p className="font-medium text-sm">{info.projectName}</p>
                                <p className="text-xs text-gray-500">{info.projectCode} • {info.quantity} units</p>
                              </div>
                              {/* Status timestamps */}
                              <div className="text-xs space-y-0.5 pt-2 border-t border-gray-100">
                                {info.dispatched_at && (
                                  <p className="text-gray-500 flex items-center gap-1">
                                    <Truck className="w-3 h-3" />
                                    Dispatched: {new Date(info.dispatched_at).toLocaleDateString()} {new Date(info.dispatched_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </p>
                                )}
                                {info.is_received ? (
                                  <p className="text-green-600 flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" />
                                    Received: {info.received_at ? `${new Date(info.received_at).toLocaleDateString()} ${new Date(info.received_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : ''} {info.received_by && `by ${info.received_by}`}
                                  </p>
                                ) : (
                                  <p className="text-yellow-600 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Pending SE receipt
                                  </p>
                                )}
                              </div>
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
              {maintenanceRecords.slice(0, MAX_PENDING_REPAIRS_DISPLAY).map(maint => (
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
      {renderDispatchPanel()}
      {showCategoryModal && renderCategoryModal()}

      {/* Process Return Request Modal */}
      {showProcessModal && selectedReturnRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 border-b bg-green-50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Process Return Request</h3>
                </div>
                <button onClick={() => setShowProcessModal(false)} className="p-1 hover:bg-green-100 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Request Info */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-start">
                  <span className="font-mono text-sm bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                    {selectedReturnRequest.tracking_code}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getConditionColor(selectedReturnRequest.se_condition_assessment)}`}>
                    SE Assessment: {selectedReturnRequest.se_condition_assessment}
                  </span>
                </div>
                <p className="font-medium text-gray-900">{selectedReturnRequest.category_name}</p>
                <div className="text-sm text-gray-500 space-y-1">
                  <p className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedReturnRequest.project_details?.project_name}</p>
                  <p className="flex items-center gap-1"><Package className="w-3 h-3" /> {selectedReturnRequest.quantity} unit(s)</p>
                  <p className="flex items-center gap-1"><User className="w-3 h-3" /> Requested by: {selectedReturnRequest.requested_by}</p>
                  <p className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(selectedReturnRequest.requested_at).toLocaleString()}</p>
                </div>
                {selectedReturnRequest.se_damage_description && (
                  <p className="text-sm text-orange-600 flex items-start gap-1 pt-2 border-t">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    {selectedReturnRequest.se_damage_description}
                  </p>
                )}
              </div>

              {/* PM Assessment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your Condition Assessment</label>
                <div className="grid grid-cols-4 gap-2">
                  {VALID_CONDITIONS.map(cond => (
                    <button key={cond} type="button" onClick={() => setProcessForm({ ...processForm, pm_condition_assessment: cond })}
                      className={`py-2 px-2 rounded-lg border-2 text-xs font-medium capitalize transition-colors ${processForm.pm_condition_assessment === cond ? getConditionColor(cond) + ' border-current' : 'border-gray-200 hover:border-gray-300'}`}>
                      {cond}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Action</label>
                <div className="grid grid-cols-1 gap-2">
                  <button type="button" onClick={() => setProcessForm({ ...processForm, pm_action: 'return_to_stock' })}
                    className={`p-3 rounded-lg border-2 text-left ${processForm.pm_action === 'return_to_stock' ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-medium text-sm">Return to Stock</p>
                        <p className="text-xs text-gray-500">Item is in good condition, make it available</p>
                      </div>
                    </div>
                  </button>
                  <button type="button" onClick={() => setProcessForm({ ...processForm, pm_action: 'send_to_maintenance' })}
                    className={`p-3 rounded-lg border-2 text-left ${processForm.pm_action === 'send_to_maintenance' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-2">
                      <Wrench className="w-5 h-5 text-orange-600" />
                      <div>
                        <p className="font-medium text-sm">Send to Maintenance</p>
                        <p className="text-xs text-gray-500">Item needs repair before next use</p>
                      </div>
                    </div>
                  </button>
                  <button type="button" onClick={() => setProcessForm({ ...processForm, pm_action: 'write_off' })}
                    className={`p-3 rounded-lg border-2 text-left ${processForm.pm_action === 'write_off' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className="flex items-center gap-2">
                      <X className="w-5 h-5 text-red-600" />
                      <div>
                        <p className="font-medium text-sm">Write Off</p>
                        <p className="text-xs text-gray-500">Item is beyond repair, remove from inventory</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                <textarea value={processForm.pm_notes} onChange={e => setProcessForm({ ...processForm, pm_notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} placeholder="Any notes about this return..." />
              </div>
            </div>

            <div className="p-4 border-t flex gap-2">
              <button onClick={() => setShowProcessModal(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 font-medium">
                Cancel
              </button>
              <button onClick={handleProcessReturnRequest}
                disabled={processingRequest === selectedReturnRequest.request_id}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                {processingRequest === selectedReturnRequest.request_id ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Processing...</>
                ) : (
                  <><Check className="w-4 h-4" /> Process Return</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && selectedCategoryForHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[85vh] overflow-hidden">
            <div className="p-4 border-b bg-indigo-50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{selectedCategoryForHistory.category_name} History</h3>
                    <p className="text-xs text-gray-500">{selectedCategoryForHistory.category_code} - Complete movement records</p>
                  </div>
                </div>
                <button onClick={() => { setShowHistoryModal(false); setSelectedCategoryForHistory(null); }} className="p-1 hover:bg-indigo-100 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[65vh]">
              {loadingHistory ? (
                <div className="p-8 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
                  <p className="text-sm text-gray-500 mt-2">Loading history...</p>
                </div>
              ) : movements.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <History className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No movement history for this asset</p>
                </div>
              ) : (
                <div className="divide-y">
                  {movements.map(mov => (
                    <div key={mov.movement_id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          {/* Header row with action and date */}
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                              mov.movement_type === 'DISPATCH' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {mov.movement_type === 'DISPATCH' ? <Truck className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                              {mov.movement_type === 'DISPATCH' ? 'Dispatched' : 'Returned'}
                            </span>
                            <span className="text-sm text-gray-500">
                              {new Date(mov.dispatched_at || mov.returned_at || mov.created_at).toLocaleDateString('en-IN', {
                                day: '2-digit', month: 'short', year: 'numeric'
                              })}
                              {' '}
                              {new Date(mov.dispatched_at || mov.returned_at || mov.created_at).toLocaleTimeString('en-IN', {
                                hour: '2-digit', minute: '2-digit', hour12: true
                              })}
                            </span>
                          </div>

                          {/* Details grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div>
                              <p className="text-xs text-gray-400 uppercase">Quantity</p>
                              <p className="font-semibold text-gray-900">{mov.quantity} unit(s)</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 uppercase">Project</p>
                              <p className="font-medium text-gray-900">{mov.project_name}</p>
                              {mov.project_code && <p className="text-xs text-gray-500">{mov.project_code}</p>}
                            </div>
                            <div>
                              <p className="text-xs text-gray-400 uppercase">{mov.movement_type === 'DISPATCH' ? 'Dispatched By' : 'Returned By'}</p>
                              <p className="font-medium text-gray-900">{mov.movement_type === 'DISPATCH' ? mov.dispatched_by : mov.returned_by || '-'}</p>
                            </div>
                            {mov.item_code && (
                              <div>
                                <p className="text-xs text-gray-400 uppercase">Item Code</p>
                                <p className="font-medium text-gray-900">{mov.item_code}</p>
                              </div>
                            )}
                            {mov.condition_before && mov.movement_type === 'DISPATCH' && (
                              <div>
                                <p className="text-xs text-gray-400 uppercase">Condition (Before)</p>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getConditionColor(mov.condition_before)}`}>
                                  {mov.condition_before}
                                </span>
                              </div>
                            )}
                            {mov.condition_after && mov.movement_type === 'RETURN' && (
                              <div>
                                <p className="text-xs text-gray-400 uppercase">Condition (After)</p>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getConditionColor(mov.condition_after)}`}>
                                  {mov.condition_after}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Notes if any */}
                          {mov.notes && (
                            <div className="mt-2 p-2 bg-gray-100 rounded text-sm text-gray-600">
                              <span className="text-xs text-gray-400">Notes: </span>{mov.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 border-t bg-gray-50 flex items-center justify-between">
              <span className="text-xs text-gray-500">{movements.length} record(s)</span>
              <button onClick={() => { setShowHistoryModal(false); setSelectedCategoryForHistory(null); }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnableAssets;
