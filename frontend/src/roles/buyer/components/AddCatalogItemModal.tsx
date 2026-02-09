/**
 * AddCatalogItemModal - Create/edit catalog items or sub-items.
 *
 * Used by CatalogItemsManager for both:
 * - mode="item": Creates/edits a CatalogItem (item_name, description, category)
 * - mode="sub-item": Creates/edits a CatalogSubItem (sub_item_name, description, size, location, brand, unit)
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { rawMaterialsService, CatalogItem, CatalogSubItem } from '@/services/rawMaterialsService';
import { showSuccess, showError } from '@/utils/toastHelper';
import { apiClient } from '@/api/config';

interface MasterItem {
  item_id: number;
  item_name: string;
  description?: string;
}

interface AddCatalogItemModalProps {
  item?: CatalogItem | CatalogSubItem | null;
  parentItemId?: number;
  onClose: (saved: boolean) => void;
  mode: 'item' | 'sub-item';
  existingItems?: CatalogItem[];
  existingSubItems?: CatalogSubItem[];
}

const AddCatalogItemModal: React.FC<AddCatalogItemModalProps> = ({
  item,
  parentItemId,
  onClose,
  mode,
  existingItems = [],
  existingSubItems = [],
}) => {
  const isEdit = !!item?.id;
  const title = mode === 'item'
    ? (isEdit ? 'Edit Item' : 'Add Item')
    : (isEdit ? 'Edit Sub-Item' : 'Add Sub-Item');

  // Item fields
  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  // Sub-item extra fields
  const [subItemName, setSubItemName] = useState('');
  const [size, setSize] = useState('');
  const [specification, setSpecification] = useState('');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Master items/sub-items from BOQ tables
  const [masterItems, setMasterItems] = useState<MasterItem[]>([]);
  const [masterSubItemNames, setMasterSubItemNames] = useState<string[]>([]);
  const [masterLoading, setMasterLoading] = useState(false);
  const masterLoadedRef = useRef(false);

  // All existing items/sub-items except the one being edited
  const allOthers = useMemo(() => {
    if (mode === 'item') {
      return existingItems.filter(ei => ei.id !== item?.id);
    } else {
      return existingSubItems.filter(si => si.id !== item?.id);
    }
  }, [mode, existingItems, existingSubItems, item?.id]);

  // Split into matched (shown first) and unmatched (greyed out below)
  const { matched, unmatched } = useMemo(() => {
    const term = mode === 'item' ? itemName.trim().toLowerCase() : subItemName.trim().toLowerCase();
    if (!term) return { matched: allOthers.slice(0, 10), unmatched: [] as (CatalogItem | CatalogSubItem)[] };
    const m: (CatalogItem | CatalogSubItem)[] = [];
    const u: (CatalogItem | CatalogSubItem)[] = [];
    for (const entry of allOthers) {
      const name = mode === 'item' ? (entry as CatalogItem).item_name : (entry as CatalogSubItem).sub_item_name;
      if (name.toLowerCase().includes(term)) m.push(entry);
      else u.push(entry);
    }
    return { matched: m.slice(0, 10), unmatched: u.slice(0, 10) };
  }, [mode, itemName, subItemName, allOthers]);

  const hasExactMatch = useMemo(() => {
    if (mode === 'item') {
      const term = itemName.trim().toLowerCase();
      if (!term) return false;
      return existingItems.some(ei => ei.id !== item?.id && ei.item_name.trim().toLowerCase() === term);
    } else {
      const term = subItemName.trim().toLowerCase();
      if (!term) return false;
      return existingSubItems.some(si => si.id !== item?.id && si.sub_item_name.trim().toLowerCase() === term);
    }
  }, [mode, itemName, subItemName, existingItems, existingSubItems, item?.id]);

  // Load master items/sub-items on mount
  useEffect(() => {
    if (masterLoadedRef.current) return;
    masterLoadedRef.current = true;
    const loadMasterData = async () => {
      setMasterLoading(true);
      try {
        if (mode === 'item') {
          const response = await apiClient.get('/raw-materials/master-items');
          setMasterItems(response.data?.item_list || []);
        } else {
          const response = await apiClient.get('/raw-materials/master-sub-items');
          setMasterSubItemNames(response.data?.sub_item_names || []);
        }
      } catch {
        // Silently fail - master data is supplementary
      } finally {
        setMasterLoading(false);
      }
    };
    loadMasterData();
  }, [mode]);

  // Filter master items by search term
  const filteredMasterItems = useMemo(() => {
    if (mode !== 'item') return [];
    const term = itemName.trim().toLowerCase();
    if (!term) return masterItems.slice(0, 10);
    return masterItems.filter(mi => mi.item_name.toLowerCase().includes(term)).slice(0, 10);
  }, [mode, itemName, masterItems]);

  // Filter master sub-item names by search term
  const filteredMasterSubItems = useMemo(() => {
    if (mode !== 'sub-item') return [];
    const term = subItemName.trim().toLowerCase();
    if (!term) return masterSubItemNames.slice(0, 10);
    return masterSubItemNames.filter(name => name.toLowerCase().includes(term)).slice(0, 10);
  }, [mode, subItemName, masterSubItemNames]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (item && isEdit) {
      if (mode === 'item') {
        const i = item as CatalogItem;
        setItemName(i.item_name || '');
        setDescription(i.description || '');
        setCategory(i.category || '');
      } else {
        const si = item as CatalogSubItem;
        setSubItemName(si.sub_item_name || '');
        setDescription(si.description || '');
        setSize(si.size || '');
        setSpecification(si.specification || '');
        setBrand(si.brand || '');
        setUnit(si.unit || '');
      }
    }
  }, [item, isEdit, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'item') {
      if (!itemName.trim()) {
        setError('Item name is required');
        return;
      }

      try {
        setSaving(true);
        if (isEdit && item?.id) {
          await rawMaterialsService.updateCatalogItem(item.id, {
            item_name: itemName.trim(),
            description: description.trim() || undefined,
            category: category.trim() || undefined,
          });
          showSuccess('Item updated successfully');
        } else {
          await rawMaterialsService.createCatalogItem({
            item_name: itemName.trim(),
            description: description.trim() || undefined,
            category: category.trim() || undefined,
          });
          showSuccess('Item created successfully');
        }
        onClose(true);
      } catch (err: any) {
        showError(err.message || 'Failed to save item');
        setError(err.message || 'Failed to save item');
      } finally {
        setSaving(false);
      }
    } else {
      if (!subItemName.trim()) {
        setError('Sub-item name is required');
        return;
      }

      try {
        setSaving(true);
        const data = {
          sub_item_name: subItemName.trim(),
          description: description.trim() || undefined,
          size: size.trim() || undefined,
          specification: specification.trim() || undefined,
          brand: brand.trim() || undefined,
          unit: unit.trim() || undefined,
        };

        if (isEdit && item?.id) {
          await rawMaterialsService.updateSubItem(item.id, data);
          showSuccess('Sub-item updated successfully');
        } else if (parentItemId) {
          await rawMaterialsService.addSubItem(parentItemId, data);
          showSuccess('Sub-item created successfully');
        } else {
          setError('Missing parent item. Cannot create sub-item.');
          setSaving(false);
          return;
        }
        onClose(true);
      } catch (err: any) {
        showError(err.message || 'Failed to save sub-item');
        setError(err.message || 'Failed to save sub-item');
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={() => onClose(false)}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={() => onClose(false)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-full"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {mode === 'item' ? (
            <>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Name <span className="text-red-500">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={itemName}
                  onChange={e => { setItemName(e.target.value); setError(''); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="e.g., Foundation, Roofing, Electrical"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${hasExactMatch ? 'border-amber-400' : 'border-gray-300'}`}
                  autoFocus
                />
                {hasExactMatch && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                    <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                    <span>An item with this exact name already exists</span>
                  </div>
                )}
                {showSuggestions && ((matched as CatalogItem[]).length > 0 || filteredMasterItems.length > 0) && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[280px] overflow-y-auto">
                    {(matched as CatalogItem[]).length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border-b border-amber-100 sticky top-0 z-10">
                          Catalog Items ({(matched as CatalogItem[]).length})
                        </div>
                        {(matched as CatalogItem[]).map(ei => (
                          <div key={ei.id} className="px-3 py-2 text-sm border-b border-gray-50 bg-amber-50/30 cursor-pointer hover:bg-amber-100/50" onClick={() => { setItemName(ei.item_name); setShowSuggestions(false); }}>
                            <span className="font-medium text-gray-800">{ei.item_name}</span>
                            {ei.category && <span className="ml-2 text-xs text-gray-500">{ei.category}</span>}
                            {ei.sub_items_count != null && (
                              <span className="ml-2 text-xs text-gray-400">({ei.sub_items_count} sub-items)</span>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                    {filteredMasterItems.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border-b border-purple-100 sticky top-0 z-10">
                          Master Items ({filteredMasterItems.length})
                        </div>
                        {filteredMasterItems.map(mi => (
                          <div key={mi.item_id} className="px-3 py-2 text-sm border-b border-gray-50 bg-purple-50/30 cursor-pointer hover:bg-purple-100/50" onClick={() => { setItemName(mi.item_name); setShowSuggestions(false); }}>
                            <span className="font-medium text-gray-800">{mi.item_name}</span>
                            {mi.description && <span className="ml-2 text-xs text-gray-500">{mi.description}</span>}
                          </div>
                        ))}
                      </>
                    )}
                    {masterLoading && mode === 'item' && (
                      <div className="px-3 py-2 text-xs text-gray-400 text-center">Loading master items...</div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="e.g., Civil, MEP, Finishing"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          ) : (
            <>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sub-Item Name <span className="text-red-500">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={subItemName}
                  onChange={e => { setSubItemName(e.target.value); setError(''); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="e.g., Concrete Footings, Tile Installation"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${hasExactMatch ? 'border-amber-400' : 'border-gray-300'}`}
                  autoFocus
                />
                {hasExactMatch && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                    <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                    <span>A sub-item with this exact name already exists</span>
                  </div>
                )}
                {showSuggestions && ((matched as CatalogSubItem[]).length > 0 || filteredMasterSubItems.length > 0) && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[280px] overflow-y-auto">
                    {(matched as CatalogSubItem[]).length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border-b border-amber-100 sticky top-0 z-10">
                          Catalog Sub-Items ({(matched as CatalogSubItem[]).length})
                        </div>
                        {(matched as CatalogSubItem[]).map(si => (
                          <div key={si.id} className="px-3 py-2 text-sm border-b border-gray-50 bg-amber-50/30 cursor-pointer hover:bg-amber-100/50" onClick={() => { setSubItemName(si.sub_item_name); setShowSuggestions(false); }}>
                            <span className="font-medium text-gray-800">{si.sub_item_name}</span>
                            {si.unit && <span className="ml-2 text-xs text-gray-500">{si.unit}</span>}
                            {si.brand && <span className="ml-2 text-xs text-gray-400">{si.brand}</span>}
                          </div>
                        ))}
                      </>
                    )}
                    {filteredMasterSubItems.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-50 border-b border-purple-100 sticky top-0 z-10">
                          Master Sub-Items ({filteredMasterSubItems.length})
                        </div>
                        {filteredMasterSubItems.map((name, idx) => (
                          <div key={idx} className="px-3 py-2 text-sm border-b border-gray-50 bg-purple-50/30 cursor-pointer hover:bg-purple-100/50" onClick={() => { setSubItemName(name); setShowSuggestions(false); }}>
                            <span className="font-medium text-gray-800">{name}</span>
                          </div>
                        ))}
                      </>
                    )}
                    {masterLoading && mode === 'sub-item' && (
                      <div className="px-3 py-2 text-xs text-gray-400 text-center">Loading master sub-items...</div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                  <input
                    type="text"
                    value={size}
                    onChange={e => setSize(e.target.value)}
                    placeholder="e.g., 50kg, 12mm"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    placeholder="e.g., nos, m, kg"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={brand}
                    onChange={e => setBrand(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Specification</label>
                  <input
                    type="text"
                    value={specification}
                    onChange={e => setSpecification(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : (isEdit ? 'Update' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddCatalogItemModal;
