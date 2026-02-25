import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { buyerVendorService, Vendor } from '@/roles/buyer/services/buyerVendorService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';

interface AddVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVendorAdded: (vendor: Vendor) => void;
  editVendor?: Vendor | null;
}

// Comprehensive country and phone code mapping
const COUNTRY_PHONE_CODES = [
  // Middle East & GCC
  { country: 'UAE', code: '+971', flag: '🇦🇪', region: 'Middle East' },
  { country: 'Saudi Arabia', code: '+966', flag: '🇸🇦', region: 'Middle East' },
  { country: 'Qatar', code: '+974', flag: '🇶🇦', region: 'Middle East' },
  { country: 'Kuwait', code: '+965', flag: '🇰🇼', region: 'Middle East' },
  { country: 'Bahrain', code: '+973', flag: '🇧🇭', region: 'Middle East' },
  { country: 'Oman', code: '+968', flag: '🇴🇲', region: 'Middle East' },
  { country: 'Jordan', code: '+962', flag: '🇯🇴', region: 'Middle East' },
  { country: 'Lebanon', code: '+961', flag: '🇱🇧', region: 'Middle East' },
  { country: 'Iraq', code: '+964', flag: '🇮🇶', region: 'Middle East' },
  { country: 'Yemen', code: '+967', flag: '🇾🇪', region: 'Middle East' },
  { country: 'Syria', code: '+963', flag: '🇸🇾', region: 'Middle East' },
  { country: 'Turkey', code: '+90', flag: '🇹🇷', region: 'Middle East' },
  { country: 'Egypt', code: '+20', flag: '🇪🇬', region: 'Middle East' },

  // South Asia
  { country: 'India', code: '+91', flag: '🇮🇳', region: 'South Asia' },
  { country: 'Pakistan', code: '+92', flag: '🇵🇰', region: 'South Asia' },
  { country: 'Bangladesh', code: '+880', flag: '🇧🇩', region: 'South Asia' },
  { country: 'Sri Lanka', code: '+94', flag: '🇱🇰', region: 'South Asia' },
  { country: 'Nepal', code: '+977', flag: '🇳🇵', region: 'South Asia' },
  { country: 'Afghanistan', code: '+93', flag: '🇦🇫', region: 'South Asia' },
  { country: 'Maldives', code: '+960', flag: '🇲🇻', region: 'South Asia' },

  // Southeast Asia
  { country: 'Singapore', code: '+65', flag: '🇸🇬', region: 'Southeast Asia' },
  { country: 'Malaysia', code: '+60', flag: '🇲🇾', region: 'Southeast Asia' },
  { country: 'Indonesia', code: '+62', flag: '🇮🇩', region: 'Southeast Asia' },
  { country: 'Thailand', code: '+66', flag: '🇹🇭', region: 'Southeast Asia' },
  { country: 'Philippines', code: '+63', flag: '🇵🇭', region: 'Southeast Asia' },
  { country: 'Vietnam', code: '+84', flag: '🇻🇳', region: 'Southeast Asia' },
  { country: 'Myanmar', code: '+95', flag: '🇲🇲', region: 'Southeast Asia' },
  { country: 'Cambodia', code: '+855', flag: '🇰🇭', region: 'Southeast Asia' },
  { country: 'Laos', code: '+856', flag: '🇱🇦', region: 'Southeast Asia' },
  { country: 'Brunei', code: '+673', flag: '🇧🇳', region: 'Southeast Asia' },

  // East Asia
  { country: 'China', code: '+86', flag: '🇨🇳', region: 'East Asia' },
  { country: 'Japan', code: '+81', flag: '🇯🇵', region: 'East Asia' },
  { country: 'South Korea', code: '+82', flag: '🇰🇷', region: 'East Asia' },
  { country: 'Hong Kong', code: '+852', flag: '🇭🇰', region: 'East Asia' },
  { country: 'Taiwan', code: '+886', flag: '🇹🇼', region: 'East Asia' },
  { country: 'Macau', code: '+853', flag: '🇲🇴', region: 'East Asia' },

  // North America
  { country: 'USA', code: '+1', flag: '🇺🇸', region: 'North America' },
  { country: 'Canada', code: '+1', flag: '🇨🇦', region: 'North America' },
  { country: 'Mexico', code: '+52', flag: '🇲🇽', region: 'North America' },

  // Europe - Western
  { country: 'UK', code: '+44', flag: '🇬🇧', region: 'Europe' },
  { country: 'Germany', code: '+49', flag: '🇩🇪', region: 'Europe' },
  { country: 'France', code: '+33', flag: '🇫🇷', region: 'Europe' },
  { country: 'Italy', code: '+39', flag: '🇮🇹', region: 'Europe' },
  { country: 'Spain', code: '+34', flag: '🇪🇸', region: 'Europe' },
  { country: 'Netherlands', code: '+31', flag: '🇳🇱', region: 'Europe' },
  { country: 'Belgium', code: '+32', flag: '🇧🇪', region: 'Europe' },
  { country: 'Switzerland', code: '+41', flag: '🇨🇭', region: 'Europe' },
  { country: 'Austria', code: '+43', flag: '🇦🇹', region: 'Europe' },
  { country: 'Portugal', code: '+351', flag: '🇵🇹', region: 'Europe' },
  { country: 'Ireland', code: '+353', flag: '🇮🇪', region: 'Europe' },
  { country: 'Luxembourg', code: '+352', flag: '🇱🇺', region: 'Europe' },

  // Europe - Northern
  { country: 'Sweden', code: '+46', flag: '🇸🇪', region: 'Europe' },
  { country: 'Norway', code: '+47', flag: '🇳🇴', region: 'Europe' },
  { country: 'Denmark', code: '+45', flag: '🇩🇰', region: 'Europe' },
  { country: 'Finland', code: '+358', flag: '🇫🇮', region: 'Europe' },
  { country: 'Iceland', code: '+354', flag: '🇮🇸', region: 'Europe' },

  // Europe - Eastern
  { country: 'Poland', code: '+48', flag: '🇵🇱', region: 'Europe' },
  { country: 'Czech Republic', code: '+420', flag: '🇨🇿', region: 'Europe' },
  { country: 'Hungary', code: '+36', flag: '🇭🇺', region: 'Europe' },
  { country: 'Romania', code: '+40', flag: '🇷🇴', region: 'Europe' },
  { country: 'Bulgaria', code: '+359', flag: '🇧🇬', region: 'Europe' },
  { country: 'Slovakia', code: '+421', flag: '🇸🇰', region: 'Europe' },
  { country: 'Ukraine', code: '+380', flag: '🇺🇦', region: 'Europe' },
  { country: 'Russia', code: '+7', flag: '🇷🇺', region: 'Europe' },

  // Europe - Southern
  { country: 'Greece', code: '+30', flag: '🇬🇷', region: 'Europe' },
  { country: 'Croatia', code: '+385', flag: '🇭🇷', region: 'Europe' },
  { country: 'Serbia', code: '+381', flag: '🇷🇸', region: 'Europe' },
  { country: 'Slovenia', code: '+386', flag: '🇸🇮', region: 'Europe' },

  // Oceania
  { country: 'Australia', code: '+61', flag: '🇦🇺', region: 'Oceania' },
  { country: 'New Zealand', code: '+64', flag: '🇳🇿', region: 'Oceania' },

  // Africa - Northern
  { country: 'Morocco', code: '+212', flag: '🇲🇦', region: 'Africa' },
  { country: 'Algeria', code: '+213', flag: '🇩🇿', region: 'Africa' },
  { country: 'Tunisia', code: '+216', flag: '🇹🇳', region: 'Africa' },
  { country: 'Libya', code: '+218', flag: '🇱🇾', region: 'Africa' },

  // Africa - Sub-Saharan
  { country: 'South Africa', code: '+27', flag: '🇿🇦', region: 'Africa' },
  { country: 'Nigeria', code: '+234', flag: '🇳🇬', region: 'Africa' },
  { country: 'Kenya', code: '+254', flag: '🇰🇪', region: 'Africa' },
  { country: 'Ghana', code: '+233', flag: '🇬🇭', region: 'Africa' },
  { country: 'Ethiopia', code: '+251', flag: '🇪🇹', region: 'Africa' },
  { country: 'Tanzania', code: '+255', flag: '🇹🇿', region: 'Africa' },
  { country: 'Uganda', code: '+256', flag: '🇺🇬', region: 'Africa' },

  // South America
  { country: 'Brazil', code: '+55', flag: '🇧🇷', region: 'South America' },
  { country: 'Argentina', code: '+54', flag: '🇦🇷', region: 'South America' },
  { country: 'Chile', code: '+56', flag: '🇨🇱', region: 'South America' },
  { country: 'Colombia', code: '+57', flag: '🇨🇴', region: 'South America' },
  { country: 'Peru', code: '+51', flag: '🇵🇪', region: 'South America' },
  { country: 'Venezuela', code: '+58', flag: '🇻🇪', region: 'South America' },
  { country: 'Ecuador', code: '+593', flag: '🇪🇨', region: 'South America' },
];

const AddVendorModal: React.FC<AddVendorModalProps> = ({
  isOpen,
  onClose,
  onVendorAdded,
  editVendor
}) => {
  const [formData, setFormData] = useState<Partial<Vendor>>({
    company_name: '',
    contact_person_name: '',
    email: '',
    phone_code: '+971',
    phone: '',
    street_address: '',
    city: '',
    state: '',
    country: 'UAE',
    pin_code: '',
    gst_number: '',
    category: '',
    status: 'active'
  });

  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // Get tax number label and placeholder based on country
  const getTaxNumberInfo = (country: string) => {
    const taxInfo: Record<string, { label: string; placeholder: string; example: string }> = {
      'India': { label: 'GST Number', placeholder: '22AAAAA0000A1Z5', example: '15 characters' },
      'UAE': { label: 'VAT/TRN Number', placeholder: '100000000000000', example: '15 digits' },
      'Saudi Arabia': { label: 'VAT Number', placeholder: '300000000000003', example: '15 digits' },
      'Qatar': { label: 'Tax Number', placeholder: '100000000000000', example: '15 digits' },
      'Kuwait': { label: 'Tax Number', placeholder: '100000000000000', example: '15 digits' },
      'Bahrain': { label: 'Tax Number', placeholder: '100000000000000', example: '15 digits' },
      'Oman': { label: 'Tax Number', placeholder: '100000000000000', example: '15 digits' },
      'UK': { label: 'VAT Number', placeholder: 'GB123456789 or 123456789', example: '9 or 12 digits' },
      'USA': { label: 'EIN (Employer ID)', placeholder: '12-3456789', example: 'XX-XXXXXXX' },
      'Canada': { label: 'Business Number', placeholder: '123456789RC0001', example: '9 digits + program ID' },
      'Australia': { label: 'ABN/ACN', placeholder: '12345678901', example: '9 or 11 digits' },
      'Germany': { label: 'VAT-ID (USt-IdNr)', placeholder: 'DE123456789', example: 'DE + 9 digits' },
      'France': { label: 'VAT Number', placeholder: 'FRXX123456789', example: 'FR + 11 chars' },
      'Spain': { label: 'NIF/CIF', placeholder: 'ESA12345678', example: 'ES + 8-9 chars' },
      'Italy': { label: 'VAT Number', placeholder: 'IT12345678901', example: 'IT + 11 digits' },
      'Netherlands': { label: 'VAT Number', placeholder: 'NL123456789B01', example: 'NL + 9 digits + B + 2 digits' },
      'Singapore': { label: 'GST Registration Number', placeholder: '12345678X or M12345678X', example: '8-9 digits + letter' },
      'Malaysia': { label: 'SST/GST Number', placeholder: 'A01-2345-67890123', example: 'Alphanumeric' },
      'China': { label: 'Taxpayer ID', placeholder: '123456789012345', example: '15-20 digits' },
      'Japan': { label: 'Corporate Number', placeholder: '1234567890123', example: '13 digits' },
      'South Korea': { label: 'Business Registration Number', placeholder: '123-45-67890', example: 'XXX-XX-XXXXX' },
      'Brazil': { label: 'CNPJ', placeholder: '12.345.678/0001-90', example: 'XX.XXX.XXX/XXXX-XX' },
      'Mexico': { label: 'RFC', placeholder: 'ABC123456XYZ', example: '12-13 alphanumeric' },
      'South Africa': { label: 'VAT Number', placeholder: '1234567890', example: '10 digits' },
      'New Zealand': { label: 'GST Number', placeholder: '12345678 or 123456789', example: '8-9 digits' },
      'Switzerland': { label: 'UID/VAT', placeholder: 'CHE123456789', example: 'CHE + 9 digits' },
      'Norway': { label: 'Organization Number', placeholder: '123456789', example: '9 digits' },
      'Sweden': { label: 'Organization Number', placeholder: '123456789012', example: '12 digits' },
      'Denmark': { label: 'CVR Number', placeholder: '12345678', example: '8 digits' },
      'Finland': { label: 'Business ID', placeholder: '1234567-8', example: '7 digits + check digit' },
    };

    return taxInfo[country] || { label: 'Tax/VAT Number', placeholder: 'Enter tax number', example: 'Country-specific format' };
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    if (editVendor) {
      setFormData(editVendor);
    } else {
      resetForm();
    }
  }, [editVendor, isOpen]);

  const loadCategories = async () => {
    try {
      const cats = await buyerVendorService.getVendorCategories();
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
      setCategories(buyerVendorService.getDefaultCategories());
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '__add_new__') {
      setShowNewCategoryInput(true);
      setFormData(prev => ({ ...prev, category: '' }));
    } else {
      setShowNewCategoryInput(false);
      setNewCategoryName('');
      setFormData(prev => ({ ...prev, category: value }));
    }
  };

  const handleCreateNewCategory = async () => {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      showWarning('Please enter a category name');
      return;
    }

    // Check if category already exists (case-insensitive)
    const exists = categories.some(
      cat => cat.toLowerCase() === trimmedName.toLowerCase()
    );
    if (exists) {
      showWarning('This category already exists');
      const existingCat = categories.find(
        cat => cat.toLowerCase() === trimmedName.toLowerCase()
      );
      if (existingCat) {
        setFormData(prev => ({ ...prev, category: existingCat }));
        setShowNewCategoryInput(false);
        setNewCategoryName('');
      }
      return;
    }

    setIsCreatingCategory(true);
    try {
      const result = await buyerVendorService.createVendorCategory(trimmedName);
      if (result.success) {
        showSuccess(`Category "${trimmedName}" created successfully`);
        // Add the new category to the list and select it
        setCategories(prev => [...prev, trimmedName].sort());
        setFormData(prev => ({ ...prev, category: trimmedName }));
        setShowNewCategoryInput(false);
        setNewCategoryName('');
      } else {
        showError(result.error || 'Failed to create category');
      }
    } catch (error) {
      console.error('Error creating category:', error);
      showError('Failed to create category');
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleCancelNewCategory = () => {
    setShowNewCategoryInput(false);
    setNewCategoryName('');
  };

  const resetForm = () => {
    setFormData({
      company_name: '',
      contact_person_name: '',
      email: '',
      phone_code: '+971',
      phone: '',
      street_address: '',
      city: '',
      state: '',
      country: 'UAE',
      pin_code: '',
      gst_number: '',
      category: '',
      status: 'active'
    });
    setErrors([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors.length > 0) {
      setErrors([]);
    }
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCountry = e.target.value;
    const countryData = COUNTRY_PHONE_CODES.find(c => c.country === selectedCountry);

    setFormData(prev => ({
      ...prev,
      country: selectedCountry,
      phone_code: countryData?.code || '+971'
    }));

    if (errors.length > 0) {
      setErrors([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form data
    const validationErrors = buyerVendorService.validateVendorData(formData);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);

    try {
      let vendor: Vendor;

      if (editVendor && editVendor.vendor_id) {
        // Update existing vendor
        vendor = await buyerVendorService.updateVendor(editVendor.vendor_id, formData);
        showSuccess('Vendor updated successfully');
      } else {
        // Create new vendor
        vendor = await buyerVendorService.createVendor(formData as Omit<Vendor, 'vendor_id'>);
        showSuccess('Vendor added successfully');
      }

      onVendorAdded(vendor);
      onClose();
      resetForm();
    } catch (error: any) {
      console.error('Error saving vendor:', error);
      showError(error.message || 'Failed to save vendor');
      setErrors([error.message || 'Failed to save vendor']);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal - Made more compact */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden z-50"
          >
            {/* Header - More compact */}
            <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-4 py-3 border-b border-purple-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800">
                  {editVendor ? 'Edit Vendor' : 'Add New Vendor'}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 hover:bg-purple-200 rounded-lg transition-colors"
                  title="Close"
                >
                  <XMarkIcon className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Form - More compact padding */}
            <form onSubmit={handleSubmit} className="p-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
              {/* Error Messages */}
              {errors.length > 0 && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <ul className="list-disc list-inside text-sm text-red-700">
                    {errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Company Information - More compact */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-800 mb-3">Company Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="company_name"
                      type="text"
                      name="company_name"
                      value={formData.company_name}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    {!showNewCategoryInput ? (
                      <select
                        id="category"
                        name="category"
                        value={formData.category}
                        onChange={handleCategoryChange}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      >
                        <option value="">Select Category</option>
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        <option value="__add_new__" className="text-purple-600 font-medium">+ Add New Category</option>
                      </select>
                    ) : (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="Enter new category name"
                          maxLength={100}
                          className="w-full px-3 py-2 text-sm border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCreateNewCategory();
                            } else if (e.key === 'Escape') {
                              handleCancelNewCategory();
                            }
                          }}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleCreateNewCategory}
                            disabled={isCreatingCategory || !newCategoryName.trim()}
                            className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isCreatingCategory ? 'Creating...' : 'Add Category'}
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelNewCategory}
                            disabled={isCreatingCategory}
                            className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Contact Information - More compact with country-phone code relationship */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-800 mb-3">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="contact_person_name" className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Person
                    </label>
                    <input
                      id="contact_person_name"
                      type="text"
                      name="contact_person_name"
                      value={formData.contact_person_name}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter name"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="email"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      required
                      placeholder="email@example.com"
                    />
                  </div>

                  <div className="col-span-2">
                    <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
                      Country
                    </label>
                    <select
                      id="country"
                      name="country"
                      value={formData.country}
                      onChange={handleCountryChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      {COUNTRY_PHONE_CODES.map((item) => (
                        <option key={item.country} value={item.country}>
                          {item.flag} {item.country} ({item.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.phone_code}
                        readOnly
                        className="w-20 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-medium"
                        title="Phone code (auto-filled based on country)"
                      />
                      <input
                        id="phone"
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="Enter phone number"
                      />
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label htmlFor="gst_number" className="block text-sm font-medium text-gray-700 mb-1">
                      {getTaxNumberInfo(formData.country || 'UAE').label} (Optional)
                    </label>
                    <input
                      id="gst_number"
                      type="text"
                      name="gst_number"
                      value={formData.gst_number}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder={getTaxNumberInfo(formData.country || 'UAE').placeholder}
                      title={`Format: ${getTaxNumberInfo(formData.country || 'UAE').example}`}
                    />
                  </div>
                </div>
              </div>

              {/* Address Information - More compact */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-800 mb-3">Address (Optional)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label htmlFor="street_address" className="block text-sm font-medium text-gray-700 mb-1">
                      Street Address
                    </label>
                    <textarea
                      id="street_address"
                      name="street_address"
                      value={formData.street_address}
                      onChange={handleInputChange}
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                      placeholder="Enter street address"
                    />
                  </div>

                  <div>
                    <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                      City
                    </label>
                    <input
                      id="city"
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter city"
                    />
                  </div>

                  <div>
                    <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                      State/Emirate
                    </label>
                    <input
                      id="state"
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter state/emirate"
                    />
                  </div>

                  <div>
                    <label htmlFor="pin_code" className="block text-sm font-medium text-gray-700 mb-1">
                      PIN/Postal Code
                    </label>
                    <input
                      id="pin_code"
                      type="text"
                      name="pin_code"
                      value={formData.pin_code}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Enter postal code"
                    />
                  </div>
                </div>
              </div>

              {/* Actions - More compact */}
              <div className="flex justify-end gap-3 pt-3 border-t border-gray-200 mt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : editVendor ? 'Update Vendor' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};

// Performance optimization: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(AddVendorModal, (prevProps, nextProps) => {
  return prevProps.isOpen === nextProps.isOpen &&
         prevProps.editVendor?.vendor_id === nextProps.editVendor?.vendor_id;
});
