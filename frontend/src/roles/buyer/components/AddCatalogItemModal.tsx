/**
 * AddCatalogItemModal - Create/edit catalog items or sub-items.
 *
 * Used by CatalogItemsManager for both:
 * - mode="item": Creates/edits a CatalogItem (item_name, description, category)
 * - mode="sub-item": Creates/edits a CatalogSubItem (sub_item_name, description, size, location, brand, unit)
 */

import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { rawMaterialsService, CatalogItem, CatalogSubItem } from '@/services/rawMaterialsService';
import { showSuccess, showError } from '@/utils/toastHelper';

interface AddCatalogItemModalProps {
  item?: CatalogItem | CatalogSubItem | null;
  parentItemId?: number;
  onClose: (saved: boolean) => void;
  mode: 'item' | 'sub-item';
}

const AddCatalogItemModal: React.FC<AddCatalogItemModalProps> = ({
  item,
  parentItemId,
  onClose,
  mode,
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={itemName}
                  onChange={e => { setItemName(e.target.value); setError(''); }}
                  placeholder="e.g., Foundation, Roofing, Electrical"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sub-Item Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subItemName}
                  onChange={e => { setSubItemName(e.target.value); setError(''); }}
                  placeholder="e.g., Concrete Footings, Tile Installation"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
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
