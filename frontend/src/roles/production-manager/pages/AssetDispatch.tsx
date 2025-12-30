/**
 * Asset Dispatch Page (Create Delivery Note - ADN)
 * Dispatch assets from store to project sites
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Truck, Send, Package, RefreshCw,
  Trash2, Check, X, Eye, ChevronDown, ChevronUp, Download, Printer
} from 'lucide-react';
import { apiClient, API_BASE_URL } from '@/api/config';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { assetService, AssetCategory, AssetItem } from '../services/assetService';
import {
  createDeliveryNote,
  getDeliveryNotes,
  dispatchDeliveryNote,
  getAvailableForDispatch,
  AssetDeliveryNote,
  AssetCondition
} from '../services/assetDnService';
import { showSuccess, showError } from '@/utils/toastHelper';

interface SiteEngineer {
  user_id: number;
  full_name: string;
  email: string;
}

interface Project {
  project_id: number;
  project_name: string;
  project_code: string;
  location?: string;
  site_supervisors?: SiteEngineer[];
}

interface DispatchItem {
  category_id: number;
  category_name: string;
  category_code: string;
  tracking_mode: 'individual' | 'quantity';
  asset_item_id?: number;
  item_code?: string;
  serial_number?: string;
  quantity: number;
  available: number;
  condition: AssetCondition;
  notes: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ISSUED: 'bg-blue-100 text-blue-700',
  IN_TRANSIT: 'bg-yellow-100 text-yellow-700',
  DELIVERED: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-orange-100 text-orange-700',
  CANCELLED: 'bg-red-100 text-red-700'
};

const AssetDispatch: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<AssetDeliveryNote[]>([]);
  const [availableCategories, setAvailableCategories] = useState<AssetCategory[]>([]);
  const [availableItems, setAvailableItems] = useState<AssetItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedDN, setExpandedDN] = useState<number | null>(null);

  // Form state
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [siteLocation, setSiteLocation] = useState('');
  const [attentionTo, setAttentionTo] = useState('');
  const [availableSEs, setAvailableSEs] = useState<SiteEngineer[]>([]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverContact, setDriverContact] = useState('');
  const [notes, setNotes] = useState('');
  const [dispatchItems, setDispatchItems] = useState<DispatchItem[]>([]);

  // Collapsible sections state
  const [quantityExpanded, setQuantityExpanded] = useState(true);
  const [individualExpanded, setIndividualExpanded] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projectsRes, dnsData, availableData] = await Promise.all([
        apiClient.get('/all_project', { params: { per_page: 100, has_se_assigned: 'true' } }),
        getDeliveryNotes({ per_page: 50 }),
        getAvailableForDispatch()
      ]);

      setProjects(projectsRes.data?.projects || projectsRes.data?.data || []);
      setDeliveryNotes(dnsData.data);
      setAvailableCategories(availableData.quantity_based);
      setAvailableItems(availableData.individual_items);
    } catch (error) {
      console.error('Error fetching data:', error);
      showError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Handle project selection - auto-populate site location and SE list
  const handleProjectSelect = (projectId: number | null) => {
    setSelectedProjectId(projectId);

    if (projectId) {
      const selectedProject = projects.find(p => p.project_id === projectId);
      if (selectedProject) {
        // Auto-populate site location from project
        setSiteLocation(selectedProject.location || '');

        // Set available Site Engineers for dropdown
        const ses = selectedProject.site_supervisors || [];
        setAvailableSEs(ses);

        // Auto-select first SE if only one, otherwise let user choose
        if (ses.length === 1) {
          setAttentionTo(ses[0].full_name || '');
        } else if (ses.length > 1) {
          setAttentionTo(''); // Let user select from dropdown
        } else {
          setAttentionTo('');
        }
      }
    } else {
      // Clear fields if no project selected
      setSiteLocation('');
      setAttentionTo('');
      setAvailableSEs([]);
    }
  };

  const addDispatchItem = (category: AssetCategory) => {
    if (category.tracking_mode === 'quantity') {
      // Check if already added
      if (dispatchItems.some(i => i.category_id === category.category_id && !i.asset_item_id)) {
        showError('This category is already added');
        return;
      }
      setDispatchItems([...dispatchItems, {
        category_id: category.category_id,
        category_name: category.category_name,
        category_code: category.category_code,
        tracking_mode: 'quantity',
        quantity: 1,
        available: category.available_quantity,
        condition: 'good',
        notes: ''
      }]);
    }
  };

  const addIndividualItem = (item: AssetItem) => {
    // Check if already added
    if (dispatchItems.some(i => i.asset_item_id === item.item_id)) {
      showError('This item is already added');
      return;
    }
    const category = availableCategories.find(c => c.category_id === item.category_id) ||
      { category_name: item.category_name || '', category_code: item.category_code || '' };

    setDispatchItems([...dispatchItems, {
      category_id: item.category_id,
      category_name: category.category_name,
      category_code: category.category_code,
      tracking_mode: 'individual',
      asset_item_id: item.item_id,
      item_code: item.item_code,
      serial_number: item.serial_number,
      quantity: 1,
      available: 1,
      condition: item.current_condition as AssetCondition,
      notes: ''
    }]);
  };

  const removeDispatchItem = (index: number) => {
    setDispatchItems(dispatchItems.filter((_, i) => i !== index));
  };

  const updateDispatchItem = (index: number, field: keyof DispatchItem, value: string | number) => {
    const newItems = [...dispatchItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setDispatchItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProjectId) {
      showError('Please select a project');
      return;
    }

    if (dispatchItems.length === 0) {
      showError('Please add at least one item to dispatch');
      return;
    }

    // Validate quantities
    for (const item of dispatchItems) {
      if (item.quantity > item.available) {
        showError(`Quantity exceeds available stock for ${item.category_name}`);
        return;
      }
    }

    setLoading(true);
    try {
      const result = await createDeliveryNote({
        project_id: selectedProjectId,
        site_location: siteLocation || undefined,
        delivery_date: new Date().toISOString(),
        attention_to: attentionTo || undefined,
        vehicle_number: vehicleNumber || undefined,
        driver_name: driverName || undefined,
        driver_contact: driverContact || undefined,
        notes: notes || undefined,
        items: dispatchItems.map(item => ({
          category_id: item.category_id,
          asset_item_id: item.asset_item_id,
          quantity: item.quantity,
          condition: item.condition,
          notes: item.notes || undefined
        }))
      });

      showSuccess(`Delivery Note created: ${result.adn_number}`);
      resetForm();
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create delivery note';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDispatch = async (adnId: number) => {
    if (!confirm('Are you sure you want to dispatch this delivery note? Stock will be deducted.')) {
      return;
    }

    setLoading(true);
    try {
      const result = await dispatchDeliveryNote(adnId);
      showSuccess(`Delivery Note ${result.adn_number} dispatched successfully`);
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to dispatch';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedProjectId(null);
    setSiteLocation('');
    setAttentionTo('');
    setAvailableSEs([]);
    setVehicleNumber('');
    setDriverName('');
    setDriverContact('');
    setNotes('');
    setDispatchItems([]);
    setShowForm(false);
  };

  // Download Asset DN PDF
  const handleDownloadDN = async (dn: AssetDeliveryNote) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        showError('Please log in to download delivery notes');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/assets/delivery-notes/${dn.adn_id}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to download delivery note');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dn.adn_number || 'ADN'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading ADN:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to download delivery note PDF';
      showError(errorMessage);
    }
  };

  // Print Asset DN PDF
  const handlePrintDN = async (dn: AssetDeliveryNote) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        showError('Please log in to print delivery notes');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/assets/delivery-notes/${dn.adn_id}/download`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load delivery note for printing');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (error) {
      console.error('Error printing ADN:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to print delivery note';
      showError(errorMessage);
    }
  };

  if (loading && deliveryNotes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <ModernLoadingSpinners size="sm" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/pm/returnable-assets')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Asset Dispatch</h1>
            <p className="text-gray-500">Create delivery notes to dispatch assets to sites</p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            <Plus className="w-4 h-4" />
            Create DN
          </button>
        )}
      </div>

      {/* Create DN Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">New Delivery Note (ADN)</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Project Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project *
                </label>
                <select
                  value={selectedProjectId || ''}
                  onChange={(e) => handleProjectSelect(Number(e.target.value) || null)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select Project</option>
                  {projects.map(p => (
                    <option key={p.project_id} value={p.project_id}>
                      {p.project_name} ({p.project_code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Site Location
                  {siteLocation && <span className="text-xs text-green-600 ml-2">(Auto-filled)</span>}
                </label>
                <input
                  type="text"
                  value={siteLocation}
                  onChange={(e) => setSiteLocation(e.target.value)}
                  placeholder="Auto-populated from project"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${siteLocation ? 'bg-green-50' : ''}`}
                />
              </div>
            </div>

            {/* Delivery Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Attention To (Site Engineer) *
                  {availableSEs.length > 1 && <span className="text-xs text-blue-600 ml-2">({availableSEs.length} SEs available)</span>}
                  {availableSEs.length === 1 && attentionTo && <span className="text-xs text-green-600 ml-2">(Auto-filled)</span>}
                </label>
                {availableSEs.length > 1 ? (
                  <select
                    value={attentionTo}
                    onChange={(e) => setAttentionTo(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      attentionTo ? 'bg-green-50 border-green-300' : 'border-orange-300 bg-orange-50'
                    }`}
                    required
                  >
                    <option value="">-- Select Site Engineer --</option>
                    {availableSEs.map(se => (
                      <option key={se.user_id} value={se.full_name}>
                        {se.full_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={attentionTo}
                    onChange={(e) => setAttentionTo(e.target.value)}
                    placeholder={availableSEs.length === 0 ? "Select a project first" : "Auto-populated from project"}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${attentionTo ? 'bg-green-50' : ''}`}
                    readOnly={availableSEs.length === 1}
                    required={availableSEs.length === 0}
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vehicle Number
                </label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="e.g., ABC-1234"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Driver Name
                </label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="Driver name"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Asset Selection */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  Select Assets to Dispatch
                </h3>
              </div>

              <div className="p-4 space-y-4">
                {/* Quantity-based Assets Section - Collapsible */}
                {availableCategories.length > 0 && (
                  <div className="bg-blue-50 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setQuantityExpanded(!quantityExpanded)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                        <span className="text-sm font-semibold text-blue-800">Quantity-based Assets</span>
                        <span className="px-2 py-0.5 bg-blue-200 text-blue-700 text-xs font-bold rounded-full">
                          {availableCategories.length}
                        </span>
                      </div>
                      {quantityExpanded ? (
                        <ChevronUp className="w-5 h-5 text-blue-600" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-blue-600" />
                      )}
                    </button>
                    {quantityExpanded && (
                      <div
                        className={`px-4 pb-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 ${
                          availableCategories.length > 9 ? 'max-h-56 overflow-y-auto' : ''
                        }`}
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                      >
                        <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
                        {availableCategories.map(cat => {
                          const isSelected = dispatchItems.some(i => i.category_id === cat.category_id && !i.asset_item_id);
                          return (
                            <button
                              key={cat.category_id}
                              type="button"
                              onClick={() => addDispatchItem(cat)}
                              className={`flex items-center justify-between px-3 py-2 border rounded-lg transition-all text-left group relative ${
                                isSelected
                                  ? 'bg-green-100 border-green-500 ring-2 ring-green-300'
                                  : 'bg-white border-blue-200 hover:border-blue-400 hover:bg-blue-50'
                              }`}
                            >
                              {isSelected && (
                                <span className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                  <Check className="w-3 h-3 text-white" />
                                </span>
                              )}
                              <span className={`font-medium text-sm truncate ${isSelected ? 'text-green-800' : 'text-gray-800'}`}>
                                {cat.category_name}
                              </span>
                              <span className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${
                                isSelected ? 'bg-green-200 text-green-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {cat.available_quantity}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Individual Items Section - Collapsible, Grouped by Category */}
                {availableItems.length > 0 && (
                  <div className="bg-purple-50 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIndividualExpanded(!individualExpanded)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-purple-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-purple-600 rounded-full"></span>
                        <span className="text-sm font-semibold text-purple-800">Individual Items</span>
                        <span className="text-xs text-purple-600">(Tracked by Serial Number)</span>
                        <span className="px-2 py-0.5 bg-purple-200 text-purple-700 text-xs font-bold rounded-full">
                          {availableItems.length}
                        </span>
                      </div>
                      {individualExpanded ? (
                        <ChevronUp className="w-5 h-5 text-purple-600" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-purple-600" />
                      )}
                    </button>
                    {individualExpanded && (
                      <div
                        className={`px-4 pb-3 ${
                          availableItems.length > 9 ? 'max-h-72 overflow-y-auto' : ''
                        }`}
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                      >
                        {/* Group items by category */}
                        {Object.entries(
                          availableItems.reduce((groups, item) => {
                            const category = item.category_name || 'Other';
                            if (!groups[category]) groups[category] = [];
                            groups[category].push(item);
                            return groups;
                          }, {} as Record<string, typeof availableItems>)
                        ).map(([categoryName, items]) => (
                          <div key={categoryName} className="mb-3 last:mb-0">
                            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1.5">{categoryName}</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {items.map(item => {
                                const isSelected = dispatchItems.some(i => i.asset_item_id === item.item_id);
                                return (
                                  <button
                                    key={item.item_id}
                                    type="button"
                                    onClick={() => addIndividualItem(item)}
                                    className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-all text-left relative ${
                                      isSelected
                                        ? 'bg-green-100 border-green-500 ring-2 ring-green-300'
                                        : 'bg-white border-purple-200 hover:border-purple-400 hover:bg-purple-50'
                                    }`}
                                  >
                                    {isSelected ? (
                                      <span className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                                        <Check className="w-3 h-3 text-white" />
                                      </span>
                                    ) : (
                                      <Plus className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <span className={`text-sm font-medium block truncate ${isSelected ? 'text-green-800' : 'text-gray-800'}`}>
                                        {item.serial_number || item.item_code}
                                      </span>
                                      <span className={`text-xs ${isSelected ? 'text-green-600' : 'text-gray-500'}`}>{item.item_code}</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Selected Items */}
                {dispatchItems.length > 0 && (
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-green-800 mb-2 flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      Items to Dispatch ({dispatchItems.length})
                    </p>
                    <div className="space-y-2">
                      {dispatchItems.map((item, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 bg-white border border-green-200 rounded-lg">
                          <div className={`p-2 rounded-lg ${item.tracking_mode === 'individual' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                            <Package className={`w-4 h-4 ${item.tracking_mode === 'individual' ? 'text-purple-600' : 'text-blue-600'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-gray-900 block">{item.category_name}</span>
                            {item.tracking_mode === 'individual' && (
                              <span className="text-xs text-gray-500">
                                {item.serial_number ? `SN: ${item.serial_number}` : item.item_code}
                              </span>
                            )}
                          </div>
                          {item.tracking_mode === 'quantity' && (
                            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg">
                              <label className="text-xs text-gray-600 font-medium">Qty:</label>
                              <input
                                type="number"
                                min="1"
                                max={item.available}
                                value={item.quantity}
                                onChange={(e) => updateDispatchItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                className="w-14 px-2 py-1 text-sm border rounded text-center font-semibold"
                              />
                              <span className="text-xs text-gray-400">/ {item.available}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeDispatchItem(index)}
                            className="p-2 text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dispatchItems.length === 0 && availableCategories.length === 0 && availableItems.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No assets available for dispatch</p>
                  </div>
                )}

                {dispatchItems.length === 0 && (availableCategories.length > 0 || availableItems.length > 0) && (
                  <div className="text-center py-4 text-gray-500 border-t border-dashed">
                    Click on assets above to add them to this delivery note
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={2}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || dispatchItems.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                Create Delivery Note
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delivery Notes List - Table Style like Material DN */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2 text-gray-800">
            <Truck className="w-5 h-5 text-blue-500" />
            Asset Delivery Notes (ADN)
          </h2>
          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            {deliveryNotes.length} Notes
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ADN Number</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Site Engineer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {deliveryNotes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No delivery notes yet</p>
                    <p className="text-sm text-gray-400 mt-1">Create a new DN to dispatch assets to sites</p>
                  </td>
                </tr>
              ) : (
                deliveryNotes.map(dn => (
                  <React.Fragment key={dn.adn_id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedDN(expandedDN === dn.adn_id ? null : dn.adn_id)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                          {expandedDN === dn.adn_id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </button>
                        <span className="font-semibold text-blue-600">{dn.adn_number}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900">{dn.project_name || '-'}</div>
                      <div className="text-xs text-gray-500">{dn.site_location || ''}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">
                        {dn.items?.length || 0} items
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      {dn.attention_to || '-'}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <div className="text-gray-900">{dn.vehicle_number || '-'}</div>
                      {dn.driver_name && <div className="text-xs text-gray-500">{dn.driver_name}</div>}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[dn.status]}`}>
                        {dn.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {new Date(dn.delivery_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-1">
                        {/* Download & Print Buttons - Always available */}
                        <button
                          onClick={() => handleDownloadDN(dn)}
                          className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                          title="Download PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePrintDN(dn)}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Print"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        {/* Status-based Actions */}
                        {dn.status === 'DRAFT' && (
                          <button
                            onClick={() => handleDispatch(dn.adn_id)}
                            className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium flex items-center gap-1 ml-1"
                          >
                            <Send className="w-3 h-3" />
                            Dispatch
                          </button>
                        )}
                        {dn.status === 'ISSUED' && (
                          <span className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-lg font-medium ml-1">
                            Issued
                          </span>
                        )}
                        {dn.status === 'IN_TRANSIT' && (
                          <span className="px-3 py-1.5 text-xs bg-yellow-100 text-yellow-700 rounded-lg font-medium flex items-center gap-1 ml-1">
                            <Truck className="w-3 h-3" />
                            In Transit
                          </span>
                        )}
                        {dn.status === 'DELIVERED' && (
                          <span className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg font-medium flex items-center gap-1 ml-1">
                            <Check className="w-3 h-3" />
                            Delivered
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Expanded Details Row - Inline with each DN */}
                  {expandedDN === dn.adn_id && (
                    <tr>
                      <td colSpan={8} className="bg-gray-50 px-6 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                          <div>
                            <span className="text-gray-500 text-xs uppercase">Delivery Date</span>
                            <p className="font-medium">{new Date(dn.delivery_date).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <span className="text-gray-500 text-xs uppercase">Attention To</span>
                            <p className="font-medium">{dn.attention_to || '-'}</p>
                          </div>
                          <div>
                            <span className="text-gray-500 text-xs uppercase">Driver</span>
                            <p className="font-medium">{dn.driver_name || '-'}</p>
                          </div>
                          <div>
                            <span className="text-gray-500 text-xs uppercase">Vehicle</span>
                            <p className="font-medium">{dn.vehicle_number || '-'}</p>
                          </div>
                        </div>

                        {/* Receiver Notes - Show when PARTIAL status */}
                        {dn.status === 'PARTIAL' && dn.receiver_notes && (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                            <p className="text-xs font-medium text-orange-800 uppercase mb-1">
                              Why Some Items Not Received (SE Notes)
                            </p>
                            <p className="text-sm text-orange-700">{dn.receiver_notes}</p>
                          </div>
                        )}

                        {/* Items Table */}
                        <div className="border rounded-lg overflow-hidden bg-white">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">Asset</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">Item Code</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">Qty</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">Received</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-gray-600 uppercase">Returned</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {dn.items.map(item => (
                                <tr key={item.item_id} className={`hover:bg-gray-50 ${!item.is_received ? 'bg-yellow-50/50' : ''}`}>
                                  <td className="px-3 py-2 font-medium text-gray-900">{item.category_name}</td>
                                  <td className="px-3 py-2 text-gray-500">{item.item_code || '-'}</td>
                                  <td className="px-3 py-2 text-center font-semibold text-blue-600">{item.quantity}</td>
                                  <td className="px-3 py-2 text-center">
                                    {item.is_received ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                        <Check className="w-3 h-3" /> Yes
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                        <X className="w-3 h-3" /> No
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-center font-semibold text-orange-600">{item.quantity_returned}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                      item.status === 'fully_returned' ? 'bg-green-100 text-green-700' :
                                      item.status === 'partial_return' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-blue-100 text-blue-700'
                                    }`}>
                                      {item.status?.replace('_', ' ')}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AssetDispatch;
