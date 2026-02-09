/**
 * Asset Stock In Page
 * Add new assets to inventory - First step in the DN/RDN flow
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Package, Save, RefreshCw, Hash, X, Check, Building2, Upload, FileText, ExternalLink, Trash2, ChevronLeft, ChevronRight
} from 'lucide-react';
import { apiClient } from '@/api/config';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { assetService, AssetCategory } from '../services/assetService';
import { createStockIn, getStockInList, StockIn, uploadStockInDocument } from '../services/assetDnService';
import { showSuccess, showError } from '@/utils/toastHelper';
import { PAGINATION } from '@/lib/inventoryConstants';

interface StockInItemInput {
  serial_number: string;
  condition: string;
  notes: string;
}

interface Vendor {
  vendor_id: number;
  company_name: string;
  contact_person_name?: string;
  phone?: string;
  email?: string;
  city?: string;
  status: string;
}

const AssetStockIn: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [stockInHistory, setStockInHistory] = useState<StockIn[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Category input state
  const [categoryInput, setCategoryInput] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [isCreatingNewCategory, setIsCreatingNewCategory] = useState(false);
  const [newCategoryTrackingMode, setNewCategoryTrackingMode] = useState<'quantity' | 'individual'>('quantity');
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Vendor input state
  const [vendorInput, setVendorInput] = useState('');
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const vendorDropdownRef = useRef<HTMLDivElement>(null);

  // Form state
  const [quantity, setQuantity] = useState(1);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [unitCost, setUnitCost] = useState(0);
  const [condition, setCondition] = useState('new');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<StockInItemInput[]>([]);

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedCategory = categories.find(c => c.category_id === selectedCategoryId);
  const selectedVendor = vendors.find(v => v.vendor_id === selectedVendorId);

  // Filter categories based on input
  const filteredCategories = categories.filter(cat =>
    cat.category_name.toLowerCase().includes(categoryInput.toLowerCase()) ||
    cat.category_code.toLowerCase().includes(categoryInput.toLowerCase())
  );

  // Filter vendors based on input
  const filteredVendors = vendors.filter(v =>
    v.company_name.toLowerCase().includes(vendorInput.toLowerCase()) ||
    (v.contact_person_name && v.contact_person_name.toLowerCase().includes(vendorInput.toLowerCase()))
  );

  // Check if input matches an existing category exactly
  const exactMatch = categories.find(
    cat => cat.category_name.toLowerCase() === categoryInput.toLowerCase()
  );

  // Pagination calculations for stock in history
  const totalPages = Math.ceil(stockInHistory.length / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedStockInHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return stockInHistory.slice(startIndex, startIndex + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [stockInHistory, currentPage]);

  // Clamp page when total pages decreases
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    // When category changes and it's individual tracking, reset items
    const trackingMode = selectedCategory?.tracking_mode || (isCreatingNewCategory ? newCategoryTrackingMode : null);
    if (trackingMode === 'individual') {
      setItems(Array(quantity).fill(null).map(() => ({
        serial_number: '',
        condition: 'new',
        notes: ''
      })));
    } else {
      setItems([]);
    }
  }, [selectedCategoryId, quantity, isCreatingNewCategory, newCategoryTrackingMode]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
      if (vendorDropdownRef.current && !vendorDropdownRef.current.contains(event.target as Node)) {
        setShowVendorDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch categories and stock-in data (required)
      const [categoriesData, stockInData] = await Promise.all([
        assetService.getCategories(),
        getStockInList({ per_page: 20 })
      ]);
      setCategories(categoriesData.filter((c: AssetCategory) => c.is_active));
      setStockInHistory(stockInData.data);

      // Fetch vendors separately (may fail due to role restrictions)
      try {
        const vendorsData = await apiClient.get('/vendor/all', { params: { per_page: 100, status: 'active' } });
        setVendors(vendorsData.data?.vendors || []);
      } catch (vendorError) {
        // Vendor list not accessible for this role - that's OK, user can still type vendor name manually
        console.log('Vendor list not accessible - manual entry available');
        setVendors([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      showError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCategorySelect = (category: AssetCategory) => {
    setSelectedCategoryId(category.category_id);
    setCategoryInput(category.category_name);
    setIsCreatingNewCategory(false);
    setShowCategoryDropdown(false);
  };

  const handleCreateNewCategory = () => {
    if (!categoryInput.trim()) {
      showError('Please enter a category name');
      return;
    }
    setIsCreatingNewCategory(true);
    setSelectedCategoryId(null);
    setShowCategoryDropdown(false);
  };

  const cancelNewCategory = () => {
    setIsCreatingNewCategory(false);
    setCategoryInput('');
    setSelectedCategoryId(null);
  };

  const handleVendorSelect = (vendor: Vendor) => {
    setSelectedVendorId(vendor.vendor_id);
    setVendorInput(vendor.company_name);
    setShowVendorDropdown(false);
  };

  const clearVendorSelection = () => {
    setSelectedVendorId(null);
    setVendorInput('');
  };

  const createNewCategory = async (): Promise<number | null> => {
    try {
      const response = await apiClient.post('/assets/categories', {
        category_name: categoryInput.trim(),
        tracking_mode: newCategoryTrackingMode,
        total_quantity: 0,
        unit_price: unitCost
      });

      // Backend returns { message: '...', category: {...} } on success (201)
      if (response.data.category) {
        const newCategory = response.data.category;
        showSuccess(`Category "${newCategory.category_name}" created`);
        // Refresh categories list
        const categoriesData = await assetService.getCategories();
        setCategories(categoriesData.filter((c: AssetCategory) => c.is_active));
        return newCategory.category_id;
      } else {
        throw new Error(response.data.error || 'Failed to create category');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create category';
      showError(message);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCategoryId && !isCreatingNewCategory) {
      showError('Please select or create an asset category');
      return;
    }

    if (quantity < 1) {
      showError('Quantity must be at least 1');
      return;
    }

    if (!selectedFile) {
      showError('Please upload a document (DN/Invoice/Receipt)');
      return;
    }

    setLoading(true);
    try {
      let categoryId = selectedCategoryId;

      // Create new category if needed
      if (isCreatingNewCategory) {
        categoryId = await createNewCategory();
        if (!categoryId) {
          setLoading(false);
          return;
        }
      }

      const data: {
        category_id: number;
        quantity: number;
        purchase_date?: string;
        vendor_name?: string;
        vendor_id?: number;
        invoice_number?: string;
        unit_cost?: number;
        condition?: string;
        notes?: string;
        items?: StockInItemInput[];
      } = {
        category_id: categoryId!,
        quantity,
        purchase_date: purchaseDate,
        vendor_id: selectedVendorId || undefined,
        vendor_name: selectedVendor?.company_name || vendorInput || undefined,
        invoice_number: invoiceNumber || undefined,
        unit_cost: unitCost,
        condition,
        notes: notes || undefined
      };

      // Add items for individual tracking
      const trackingMode = selectedCategory?.tracking_mode || (isCreatingNewCategory ? newCategoryTrackingMode : null);
      if (trackingMode === 'individual') {
        data.items = items;
      }

      const result = await createStockIn(data);
      showSuccess(`Stock in created: ${result.stock_in_number}`);

      // Upload document if selected
      if (selectedFile && result.stock_in_id) {
        setUploadingDocument(true);
        try {
          await uploadStockInDocument(result.stock_in_id, selectedFile);
          showSuccess('Document uploaded successfully');
        } catch (uploadError) {
          console.error('Document upload failed:', uploadError);
          showError('Stock in created but document upload failed');
        } finally {
          setUploadingDocument(false);
        }
      }

      resetForm();
      fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create stock in';
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedCategoryId(null);
    setCategoryInput('');
    setIsCreatingNewCategory(false);
    setNewCategoryTrackingMode('quantity');
    setSelectedVendorId(null);
    setVendorInput('');
    setQuantity(1);
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setInvoiceNumber('');
    setUnitCost(0);
    setCondition('new');
    setNotes('');
    setItems([]);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowForm(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
      if (!allowedTypes.includes(file.type)) {
        showError('Invalid file type. Allowed: PDF, Images, Word, Excel');
        return;
      }
      // Validate file size (10MB max - matches inventory-files bucket limit)
      if (file.size > 10 * 1024 * 1024) {
        showError('File too large. Maximum size is 10MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const clearFileSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateItem = (index: number, field: keyof StockInItemInput, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  // Determine current tracking mode for display
  const currentTrackingMode = selectedCategory?.tracking_mode || (isCreatingNewCategory ? newCategoryTrackingMode : null);

  if (loading && categories.length === 0) {
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
            onClick={() => {
              if (showForm) {
                setShowForm(false);
              } else {
                navigate('/production-manager/returnable-assets');
              }
            }}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Asset Stock In</h1>
            <p className="text-gray-500">Add new assets to inventory</p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
          >
            <Plus className="w-4 h-4" />
            Add Stock
          </button>
        )}
      </div>

      {/* Stock In Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">New Stock In</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Category Selection with Autocomplete */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative" ref={dropdownRef}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Asset Category *
                </label>
                <div className="relative">
                  <input
                    ref={categoryInputRef}
                    type="text"
                    value={categoryInput}
                    onChange={(e) => {
                      setCategoryInput(e.target.value);
                      setShowCategoryDropdown(true);
                      if (selectedCategoryId) {
                        // User is typing, clear selection
                        setSelectedCategoryId(null);
                        setIsCreatingNewCategory(false);
                      }
                    }}
                    onFocus={() => setShowCategoryDropdown(true)}
                    placeholder="Type to search or add new category..."
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 pr-10 ${
                      isCreatingNewCategory ? 'border-green-500 bg-green-50' :
                      selectedCategoryId ? 'border-blue-500 bg-blue-50' : ''
                    }`}
                    required
                  />
                  {(selectedCategoryId || isCreatingNewCategory) && (
                    <button
                      type="button"
                      onClick={cancelNewCategory}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
                </div>

                {/* Status indicator */}
                {selectedCategoryId && (
                  <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Selected: {selectedCategory?.category_name} ({selectedCategory?.tracking_mode})
                  </p>
                )}
                {isCreatingNewCategory && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <Plus className="w-3 h-3" />
                    Creating new category: "{categoryInput}"
                  </p>
                )}

                {/* Dropdown */}
                {showCategoryDropdown && categoryInput && !selectedCategoryId && !isCreatingNewCategory && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                    {filteredCategories.length > 0 && (
                      <>
                        {filteredCategories.map(cat => (
                          <button
                            key={cat.category_id}
                            type="button"
                            onClick={() => handleCategorySelect(cat)}
                            className="w-full px-4 py-2 text-left hover:bg-blue-50 flex justify-between items-center"
                          >
                            <span>
                              <span className="font-medium">{cat.category_name}</span>
                              <span className="text-gray-400 ml-2">({cat.category_code})</span>
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              cat.tracking_mode === 'individual'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {cat.tracking_mode}
                            </span>
                          </button>
                        ))}
                        <div className="border-t" />
                      </>
                    )}

                    {/* Add new option */}
                    {!exactMatch && categoryInput.trim() && (
                      <button
                        type="button"
                        onClick={handleCreateNewCategory}
                        className="w-full px-4 py-3 text-left hover:bg-green-50 text-green-700 flex items-center gap-2 font-medium"
                      >
                        <Plus className="w-4 h-4" />
                        Add new category: "{categoryInput}"
                      </button>
                    )}

                    {filteredCategories.length === 0 && !categoryInput.trim() && (
                      <p className="px-4 py-2 text-gray-500 text-sm">
                        Start typing to search or add a category...
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity *
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity || ''}
                  placeholder="1"
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            {/* Tracking Mode for New Category */}
            {isCreatingNewCategory && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-medium text-green-800 mb-3">New Category Settings</h4>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tracking Mode *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="trackingMode"
                        value="quantity"
                        checked={newCategoryTrackingMode === 'quantity'}
                        onChange={() => setNewCategoryTrackingMode('quantity')}
                        className="w-4 h-4 text-green-600"
                      />
                      <span className="text-sm">
                        <span className="font-medium">Quantity Based</span>
                        <span className="text-gray-500 ml-1">(Track total count)</span>
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="trackingMode"
                        value="individual"
                        checked={newCategoryTrackingMode === 'individual'}
                        onChange={() => setNewCategoryTrackingMode('individual')}
                        className="w-4 h-4 text-green-600"
                      />
                      <span className="text-sm">
                        <span className="font-medium">Individual</span>
                        <span className="text-gray-500 ml-1">(Track by serial number)</span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Vendor Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative" ref={vendorDropdownRef}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Building2 className="w-4 h-4 inline mr-1" />
                  Vendor
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={vendorInput}
                    onChange={(e) => {
                      setVendorInput(e.target.value);
                      setShowVendorDropdown(true);
                      if (selectedVendorId) {
                        setSelectedVendorId(null);
                      }
                    }}
                    onFocus={() => setShowVendorDropdown(true)}
                    placeholder="Search or type vendor name..."
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 pr-10 ${
                      selectedVendorId ? 'border-blue-500 bg-blue-50' : ''
                    }`}
                  />
                  {(selectedVendorId || vendorInput) && (
                    <button
                      type="button"
                      onClick={clearVendorSelection}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
                </div>

                {/* Vendor status indicator */}
                {selectedVendorId && selectedVendor && (
                  <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Selected: {selectedVendor.company_name}
                    {selectedVendor.city && <span className="text-gray-400">({selectedVendor.city})</span>}
                  </p>
                )}

                {/* Vendor dropdown */}
                {showVendorDropdown && vendorInput && !selectedVendorId && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                    {filteredVendors.length > 0 ? (
                      filteredVendors.map(vendor => (
                        <button
                          key={vendor.vendor_id}
                          type="button"
                          onClick={() => handleVendorSelect(vendor)}
                          className="w-full px-4 py-2 text-left hover:bg-blue-50"
                        >
                          <div className="font-medium">{vendor.company_name}</div>
                          <div className="text-xs text-gray-500 flex gap-2">
                            {vendor.contact_person_name && <span>{vendor.contact_person_name}</span>}
                            {vendor.city && <span>• {vendor.city}</span>}
                            {vendor.phone && <span>• {vendor.phone}</span>}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-gray-500 text-sm">
                        <p>No matching vendors found.</p>
                        <p className="text-xs mt-1">You can still use "{vendorInput}" as a manual entry.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Enter invoice #"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Purchase Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Purchase Date
                </label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit Cost
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost || ''}
                  placeholder="0.00"
                  onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Cost
                </label>
                <input
                  type="text"
                  value={`$${(unitCost * quantity).toFixed(2)}`}
                  disabled
                  className="w-full px-3 py-2 border rounded-lg bg-gray-50"
                />
              </div>
            </div>

            {/* Condition */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condition
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="new">New</option>
                  <option value="second_hand">Second Hand</option>
                  <option value="refurbished">Refurbished</option>
                  <option value="repaired">Repaired</option>
                </select>
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

            {/* Document Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <FileText className="w-4 h-4 inline mr-1" />
                Attach Document (DN/Invoice/Receipt) <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <Upload className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-600">
                    {selectedFile ? 'Change File' : 'Upload Document'}
                  </span>
                </button>
                {selectedFile && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-700 font-medium max-w-[200px] truncate">
                      {selectedFile.name}
                    </span>
                    <span className="text-xs text-blue-500">
                      ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={clearFileSelection}
                      className="p-1 hover:bg-blue-100 rounded"
                    >
                      <X className="w-4 h-4 text-blue-600" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Supported: PDF, Word, Excel, Images (Max 10MB)
              </p>
            </div>

            {/* Individual Items (for individual tracking mode) */}
            {currentTrackingMode === 'individual' && items.length > 0 && (
              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Hash className="w-4 h-4" />
                  Individual Items (Serial Numbers)
                </h3>
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Serial Number #{index + 1}
                        </label>
                        <input
                          type="text"
                          value={item.serial_number}
                          onChange={(e) => updateItem(index, 'serial_number', e.target.value)}
                          placeholder="Enter serial #"
                          className="w-full px-2 py-1 text-sm border rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Condition
                        </label>
                        <select
                          value={item.condition}
                          onChange={(e) => updateItem(index, 'condition', e.target.value)}
                          className="w-full px-2 py-1 text-sm border rounded"
                        >
                          <option value="new">New</option>
                          <option value="second_hand">Second Hand</option>
                          <option value="refurbished">Refurbished</option>
                          <option value="repaired">Repaired</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Notes
                        </label>
                        <input
                          type="text"
                          value={item.notes}
                          onChange={(e) => updateItem(index, 'notes', e.target.value)}
                          placeholder="Notes"
                          className="w-full px-2 py-1 text-sm border rounded"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                disabled={loading || uploadingDocument || (!selectedCategoryId && !isCreatingNewCategory) || !selectedFile}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
              >
                {(loading || uploadingDocument) ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {uploadingDocument
                  ? 'Uploading Document...'
                  : isCreatingNewCategory
                    ? 'Create Category & Stock In'
                    : 'Create Stock In'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Stock In History */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b">
          <h2 className="font-semibold flex items-center gap-2">
            <Package className="w-5 h-5 text-gray-600" />
            Stock In History
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock In #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Cost</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginatedStockInHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No stock in records yet
                  </td>
                </tr>
              ) : (
                paginatedStockInHistory.map(si => (
                  <tr key={si.stock_in_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-blue-600">{si.stock_in_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium">{si.category_name}</span>
                        <span className="text-xs text-gray-400 ml-2">({si.category_code})</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{si.quantity}</td>
                    <td className="px-4 py-3 text-gray-600">{si.vendor_name || '-'}</td>
                    <td className="px-4 py-3">${si.total_cost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm">
                      {new Date(si.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {si.document_url ? (
                        <a
                          href={si.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                        >
                          <FileText className="w-3 h-3" />
                          View
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {stockInHistory.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between text-sm">
            <span className="text-gray-600">
              Showing {((currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE) + 1} - {Math.min(currentPage * PAGINATION.DEFAULT_PAGE_SIZE, stockInHistory.length)} of {stockInHistory.length} records
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetStockIn;
