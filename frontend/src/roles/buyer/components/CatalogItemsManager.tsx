/**
 * CatalogItemsManager - Hierarchical catalog UI for Items -> Sub-Items -> Materials
 *
 * Accordion-based tree view allowing buyers to manage catalog items,
 * add sub-items, and link raw materials to sub-items.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  LinkIcon,
  XMarkIcon,
  CubeIcon,
} from '@heroicons/react/24/outline';
import {
  rawMaterialsService,
  CatalogItem,
  CatalogSubItem,
  CatalogLinkedMaterial,
  RawMaterial,
} from '@/services/rawMaterialsService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { showSuccess, showError } from '@/utils/toastHelper';
import AddCatalogItemModal from './AddCatalogItemModal';

const CatalogItemsManager: React.FC = () => {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [expandedSubItems, setExpandedSubItems] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [showSubItemModal, setShowSubItemModal] = useState(false);
  const [editingSubItem, setEditingSubItem] = useState<CatalogSubItem | null>(null);
  const [parentItemIdForSub, setParentItemIdForSub] = useState<number | null>(null);

  // Link material states
  const [linkingSubItemId, setLinkingSubItemId] = useState<number | null>(null);
  const [materialSearch, setMaterialSearch] = useState('');
  const [materialResults, setMaterialResults] = useState<RawMaterial[]>([]);
  const [materialSearchLoading, setMaterialSearchLoading] = useState(false);
  const [linkQuantity, setLinkQuantity] = useState(1);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const response = await rawMaterialsService.getCatalogItems({
        include_full: true,
        per_page: 200,
      });
      setItems(response.items);
    } catch (error: any) {
      console.error('Error loading catalog items:', error);
      showError(error.message || 'Failed to load catalog items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Filter items by search
  const filteredItems = searchTerm
    ? items.filter(item => {
        const search = searchTerm.toLowerCase();
        if (item.item_name.toLowerCase().includes(search)) return true;
        if (item.category?.toLowerCase().includes(search)) return true;
        return item.sub_items?.some(si =>
          si.sub_item_name.toLowerCase().includes(search)
        );
      })
    : items;

  // Toggle expand/collapse
  const toggleItem = (id: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSubItem = (id: number) => {
    setExpandedSubItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // CRUD handlers
  const handleAddItem = () => {
    setEditingItem(null);
    setShowItemModal(true);
  };

  const handleEditItem = (item: CatalogItem) => {
    setEditingItem(item);
    setShowItemModal(true);
  };

  const handleDeleteItem = async (item: CatalogItem) => {
    if (!item.id) return;
    if (!window.confirm(`Delete "${item.item_name}" and all its sub-items?`)) return;
    try {
      await rawMaterialsService.deleteCatalogItem(item.id);
      showSuccess('Item deleted successfully');
      loadItems();
    } catch (error: any) {
      showError(error.message || 'Failed to delete item');
    }
  };

  const handleAddSubItem = (parentItemId: number) => {
    setEditingSubItem(null);
    setParentItemIdForSub(parentItemId);
    setShowSubItemModal(true);
  };

  const handleEditSubItem = (subItem: CatalogSubItem) => {
    setEditingSubItem(subItem);
    setParentItemIdForSub(subItem.catalog_item_id);
    setShowSubItemModal(true);
  };

  const handleDeleteSubItem = async (subItem: CatalogSubItem) => {
    if (!subItem.id) return;
    if (!window.confirm(`Delete sub-item "${subItem.sub_item_name}"?`)) return;
    try {
      await rawMaterialsService.deleteSubItem(subItem.id);
      showSuccess('Sub-item deleted successfully');
      loadItems();
    } catch (error: any) {
      showError(error.message || 'Failed to delete sub-item');
    }
  };

  // Item modal close
  const handleItemModalClose = (saved: boolean) => {
    setShowItemModal(false);
    setEditingItem(null);
    if (saved) loadItems();
  };

  // Sub-item modal close
  const handleSubItemModalClose = (saved: boolean) => {
    setShowSubItemModal(false);
    setEditingSubItem(null);
    setParentItemIdForSub(null);
    if (saved) loadItems();
  };

  // Material linking
  const startLinking = (subItemId: number) => {
    setLinkingSubItemId(subItemId);
    setMaterialSearch('');
    setMaterialResults([]);
    setLinkQuantity(1);
    // Auto-expand the sub-item so the link form is visible
    setExpandedSubItems(prev => {
      const next = new Set(prev);
      next.add(subItemId);
      return next;
    });
  };

  const cancelLinking = () => {
    setLinkingSubItemId(null);
    setMaterialSearch('');
    setMaterialResults([]);
  };

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchCounterRef = useRef(0);

  const searchMaterials = (query: string) => {
    setMaterialSearch(query);
    if (query.trim().length < 2) {
      setMaterialResults([]);
      return;
    }
    // Debounce API calls by 300ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const currentSearch = ++searchCounterRef.current;
      try {
        setMaterialSearchLoading(true);
        const response = await rawMaterialsService.searchRawMaterials(query, true, 20);
        // Only update if this is still the latest search (discard stale responses)
        if (currentSearch === searchCounterRef.current) {
          setMaterialResults(response.materials);
        }
      } catch {
        if (currentSearch === searchCounterRef.current) {
          setMaterialResults([]);
        }
      } finally {
        if (currentSearch === searchCounterRef.current) {
          setMaterialSearchLoading(false);
        }
      }
    }, 300);
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Escape key to close inline link-material form
  useEffect(() => {
    if (linkingSubItemId === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelLinking();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [linkingSubItemId]);

  const handleLinkMaterial = async (rawMaterialId: number) => {
    if (!linkingSubItemId) return;
    try {
      await rawMaterialsService.linkMaterial(linkingSubItemId, rawMaterialId, linkQuantity);
      showSuccess('Material linked successfully');
      cancelLinking();
      loadItems();
    } catch (error: any) {
      showError(error.message || 'Failed to link material');
    }
  };

  const handleUnlinkMaterial = async (subItemId: number, materialId: number, materialName: string) => {
    if (!window.confirm(`Unlink "${materialName}" from this sub-item?`)) return;
    try {
      await rawMaterialsService.unlinkMaterial(subItemId, materialId);
      showSuccess('Material unlinked');
      loadItems();
    } catch (error: any) {
      showError(error.message || 'Failed to unlink material');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <ModernLoadingSpinners size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search items or sub-items..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={handleAddItem}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center shadow-md"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Add Item
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-gray-500">
        <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
        <span>{items.reduce((sum, i) => sum + (i.sub_items?.length || 0), 0)} sub-items</span>
      </div>

      {/* Items list */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-md">
          <CubeIcon className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600 text-lg">
            {searchTerm ? 'No items match your search' : 'No catalog items yet'}
          </p>
          <p className="text-gray-500 text-sm mt-2">
            {searchTerm ? 'Try a different search term' : 'Add your first item to build a BOQ template'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map(item => {
            const isExpanded = expandedItems.has(item.id as number);
            const subItems = item.sub_items?.filter(si => si.is_active !== false) || [];

            return (
              <div key={item.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                {/* Item header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleItem(item.id as number)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronRightIcon className="w-5 h-5 text-gray-500" />
                    )}
                    <div>
                      <span className="font-semibold text-gray-900">{item.item_name}</span>
                      {item.category && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                          {item.category}
                        </span>
                      )}
                      <span className="ml-2 text-sm text-gray-500">
                        ({subItems.length} sub-item{subItems.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleAddSubItem(item.id as number)}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                      title="Add sub-item"
                    >
                      <PlusIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEditItem(item)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                      title="Edit item"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      title="Delete item"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Sub-items (expanded) */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {subItems.length === 0 ? (
                      <div className="px-8 py-4 text-sm text-gray-500 italic">
                        No sub-items yet.{' '}
                        <button
                          onClick={() => handleAddSubItem(item.id as number)}
                          className="text-blue-600 hover:underline"
                        >
                          Add one
                        </button>
                      </div>
                    ) : (
                      subItems.map(subItem => {
                        const isSubExpanded = expandedSubItems.has(subItem.id as number);
                        const materials = subItem.materials?.filter(m => m.is_active !== false) || [];

                        return (
                          <div key={subItem.id} className="border-b border-gray-50 last:border-0">
                            {/* Sub-item header */}
                            <div
                              className="flex items-center justify-between px-8 py-2.5 cursor-pointer hover:bg-gray-50"
                              onClick={() => toggleSubItem(subItem.id as number)}
                            >
                              <div className="flex items-center gap-2">
                                {isSubExpanded ? (
                                  <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                                )}
                                <span className="text-sm font-medium text-gray-800">
                                  {subItem.sub_item_name}
                                </span>
                                {subItem.unit && (
                                  <span className="text-xs text-gray-500">({subItem.unit})</span>
                                )}
                                <span className="text-xs text-gray-400">
                                  {materials.length} material{materials.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => startLinking(subItem.id as number)}
                                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                                  title="Link material"
                                >
                                  <LinkIcon className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleEditSubItem(subItem)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                  title="Edit sub-item"
                                >
                                  <PencilIcon className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteSubItem(subItem)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                                  title="Delete sub-item"
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Materials (expanded) */}
                            {isSubExpanded && (
                              <div className="pl-16 pr-8 pb-3">
                                {/* Link material inline form */}
                                {linkingSubItemId === subItem.id && (
                                  <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="text-sm font-medium text-blue-800">Link Material</span>
                                      <button onClick={cancelLinking} className="ml-auto text-gray-500 hover:text-gray-700">
                                        <XMarkIcon className="w-4 h-4" />
                                      </button>
                                    </div>
                                    <div className="flex gap-2">
                                      <div className="relative flex-1">
                                        <input
                                          type="text"
                                          placeholder="Type material name (e.g. cement)..."
                                          value={materialSearch}
                                          onChange={e => searchMaterials(e.target.value)}
                                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                          autoFocus
                                        />
                                        {materialSearchLoading && (
                                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                            <ModernLoadingSpinners size="sm" />
                                          </div>
                                        )}
                                      </div>
                                      <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={linkQuantity}
                                        onChange={e => setLinkQuantity(parseFloat(e.target.value) || 1)}
                                        className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded"
                                        placeholder="Qty"
                                      />
                                    </div>
                                    {materialSearch.trim().length > 0 && materialSearch.trim().length < 2 && (
                                      <p className="mt-1 text-xs text-gray-500">Type at least 2 characters to search</p>
                                    )}
                                    {materialSearch.trim().length >= 2 && !materialSearchLoading && materialResults.length === 0 && (
                                      <p className="mt-1 text-xs text-orange-600">No materials found. Add materials in the "Materials" tab first.</p>
                                    )}
                                    {materialResults.length > 0 && (
                                      <div className="mt-2 max-h-[280px] overflow-y-auto border border-gray-200 rounded bg-white">
                                        {materialResults.map(mat => (
                                          <button
                                            key={mat.id}
                                            onClick={() => handleLinkMaterial(mat.id as number)}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0"
                                          >
                                            <span className="font-medium">{mat.material_name}</span>
                                            {mat.brand && <span className="text-gray-500 ml-1">({mat.brand})</span>}
                                            {mat.size && <span className="text-gray-400 ml-1">{mat.size}</span>}
                                            {mat.unit_price != null && (
                                              <span className="float-right text-gray-600">{Number(mat.unit_price).toFixed(2)} AED</span>
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Linked materials list */}
                                {materials.length === 0 ? (
                                  <p className="text-xs text-gray-400 italic py-1">No materials linked</p>
                                ) : (
                                  <div className="space-y-1">
                                    {materials.map(mat => (
                                      <div
                                        key={mat.id}
                                        className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded text-sm"
                                      >
                                        <div className="flex items-center gap-2">
                                          <CubeIcon className="w-4 h-4 text-gray-400" />
                                          <span className="font-medium text-gray-700">{mat.material_name}</span>
                                          {mat.brand && <span className="text-gray-500">({mat.brand})</span>}
                                          {mat.size && <span className="text-gray-400">{mat.size}</span>}
                                          <span className="text-gray-500">- {mat.quantity} {mat.unit || 'unit'}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-gray-600 text-xs">
                                            {(mat.unit_price != null ? Number(mat.unit_price).toFixed(2) : '0.00')} AED
                                          </span>
                                          <button
                                            onClick={() => handleUnlinkMaterial(subItem.id as number, mat.raw_material_id, mat.material_name)}
                                            className="p-0.5 text-red-500 hover:text-red-700"
                                            title="Unlink material"
                                          >
                                            <XMarkIcon className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Item Modal (create/edit) */}
      {showItemModal && (
        <AddCatalogItemModal
          item={editingItem}
          onClose={handleItemModalClose}
          mode="item"
          existingItems={items}
        />
      )}

      {/* Sub-Item Modal (create/edit) */}
      {showSubItemModal && parentItemIdForSub && (
        <AddCatalogItemModal
          item={editingSubItem}
          parentItemId={parentItemIdForSub}
          onClose={handleSubItemModalClose}
          mode="sub-item"
          existingSubItems={
            items.find(i => i.id === parentItemIdForSub)?.sub_items?.filter(si => si.is_active !== false) || []
          }
        />
      )}
    </div>
  );
};

export default CatalogItemsManager;
