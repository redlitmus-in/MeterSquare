/**
 * CatalogImportModal - Estimator BOQ import from buyer's catalog.
 *
 * Loads the full catalog tree (items -> sub-items -> materials) and
 * lets the estimator select which items to import into the BOQ creation form.
 */

import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CubeIcon,
  CheckIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { rawMaterialsService, CatalogItem } from '@/services/rawMaterialsService';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface CatalogImportModalProps {
  onClose: () => void;
  onImport: (selectedItems: CatalogItem[]) => void;
}

const CatalogImportModal: React.FC<CatalogImportModalProps> = ({ onClose, onImport }) => {
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [expandedItemIds, setExpandedItemIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        setLoading(true);
        const items = await rawMaterialsService.getFullTree();
        if (!cancelled) setCatalogItems(items);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load catalog');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, []);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const filteredItems = searchTerm
    ? catalogItems.filter(item => {
        const s = searchTerm.toLowerCase();
        if (item.item_name.toLowerCase().includes(s)) return true;
        return item.sub_items?.some(si =>
          si.sub_item_name.toLowerCase().includes(s) ||
          si.materials?.some(m => m.material_name.toLowerCase().includes(s))
        );
      })
    : catalogItems;

  const toggleSelect = (id: number) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = () => {
    const selected = catalogItems.filter(item => selectedItemIds.has(item.id as number));
    onImport(selected);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Import from Catalog</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Select items to import into your BOQ
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search items, sub-items, or materials..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <ModernLoadingSpinners size="lg" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600">{error}</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <CubeIcon className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-600">
                {searchTerm ? 'No items match your search' : 'No catalog items available'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map(item => {
                const isSelected = selectedItemIds.has(item.id as number);
                const isExpanded = expandedItemIds.has(item.id as number);
                const subItems = item.sub_items || [];

                return (
                  <div
                    key={item.id}
                    className={`border rounded-lg ${isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleSelect(item.id as number)}
                        className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {isSelected && <CheckIcon className="w-3.5 h-3.5" />}
                      </button>

                      {/* Expand toggle */}
                      <button
                        onClick={() => toggleExpand(item.id as number)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {isExpanded ? (
                          <ChevronDownIcon className="w-4 h-4" />
                        ) : (
                          <ChevronRightIcon className="w-4 h-4" />
                        )}
                      </button>

                      {/* Item info */}
                      <div className="flex-1">
                        <span className="font-medium text-gray-900">{item.item_name}</span>
                        {item.category && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                            {item.category}
                          </span>
                        )}
                        <span className="ml-2 text-xs text-gray-500">
                          {subItems.length} sub-item{subItems.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Sub-items preview */}
                    {isExpanded && subItems.length > 0 && (
                      <div className="px-12 pb-3 space-y-2">
                        {subItems.map(si => (
                          <div key={si.id} className="text-sm">
                            <div className="font-medium text-gray-700">
                              {si.sub_item_name}
                              {si.unit && <span className="text-gray-400 ml-1">({si.unit})</span>}
                            </div>
                            {si.materials && si.materials.length > 0 && (
                              <div className="ml-4 mt-1 space-y-0.5">
                                {si.materials.map(mat => (
                                  <div key={mat.id} className="text-xs text-gray-500 flex items-center gap-1">
                                    <CubeIcon className="w-3 h-3" />
                                    {mat.material_name}
                                    {mat.brand && <span>({mat.brand})</span>}
                                    <span>- {mat.quantity} {mat.unit || 'unit'}</span>
                                    <span className="ml-auto">{(mat.unit_price != null ? Number(mat.unit_price).toFixed(2) : '0.00')} AED</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 shrink-0">
          <span className="text-sm text-gray-500">
            {selectedItemIds.size} item{selectedItemIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={selectedItemIds.size === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CatalogImportModal;
