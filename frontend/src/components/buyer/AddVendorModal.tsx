import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { buyerVendorService, Vendor } from '@/roles/buyer/services/buyerVendorService';
import { toast } from 'sonner';

interface AddVendorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVendorAdded: (vendor: Vendor) => void;
  editVendor?: Vendor | null;
}

// Country and phone code mapping
const COUNTRY_PHONE_CODES = [
  { country: 'UAE', code: '+971', flag: '🇦🇪' },
  { country: 'Saudi Arabia', code: '+966', flag: '🇸🇦' },
  { country: 'Qatar', code: '+974', flag: '🇶🇦' },
  { country: 'Kuwait', code: '+965', flag: '🇰🇼' },
  { country: 'Bahrain', code: '+973', flag: '🇧🇭' },
  { country: 'Oman', code: '+968', flag: '🇴🇲' },
  { country: 'India', code: '+91', flag: '🇮🇳' },
  { country: 'Pakistan', code: '+92', flag: '🇵🇰' },
  { country: 'USA', code: '+1', flag: '🇺🇸' },
  { country: 'UK', code: '+44', flag: '🇬🇧' },
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
        toast.success('Vendor updated successfully');
      } else {
        // Create new vendor
        vendor = await buyerVendorService.createVendor(formData as Omit<Vendor, 'vendor_id'>);
        toast.success('Vendor added successfully');
      }

      onVendorAdded(vendor);
      onClose();
      resetForm();
    } catch (error: any) {
      console.error('Error saving vendor:', error);
      toast.error(error.message || 'Failed to save vendor');
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
                    <select
                      id="category"
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="">Select Category</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
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

                  <div>
                    <label htmlFor="gst_number" className="block text-sm font-medium text-gray-700 mb-1">
                      GST/Tax Number
                    </label>
                    <input
                      id="gst_number"
                      type="text"
                      name="gst_number"
                      value={formData.gst_number}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="22XXXXX5678X1Z5"
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

export default AddVendorModal;
