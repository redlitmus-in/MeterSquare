/**
 * Labour Registry Page
 * Production Manager: Add and manage workers in the registry (Step 1)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { labourService, Worker, CreateWorkerData } from '@/services/labourService';
import { showSuccess, showError } from '@/utils/toastHelper';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  UserPlusIcon,
  XMarkIcon,
  EyeIcon,
  PhoneIcon,
  IdentificationIcon,
  CurrencyDollarIcon,
  UserIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
  CalendarIcon,
  ChevronDownIcon,
  CheckIcon
} from '@heroicons/react/24/outline';

const ITEMS_PER_PAGE = 20;

const LabourRegistry: React.FC = () => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [skillFilter, setSkillFilter] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [viewingWorker, setViewingWorker] = useState<Worker | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [formData, setFormData] = useState<CreateWorkerData>({
    full_name: '',
    phone: '',
    email: '',
    hourly_rate: 0,
    skills: [],
    worker_type: 'regular',
    status: 'active',
    emergency_contact: '',
    emergency_phone: '',
    id_number: '',
    notes: ''
  });
  const [skillInput, setSkillInput] = useState('');
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);
  const [countryCode, setCountryCode] = useState('+971'); // Default UAE
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalWorkers, setTotalWorkers] = useState(0);
  const [allSkillsFromDB, setAllSkillsFromDB] = useState<string[]>([]);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchTerm(searchInput);
      setCurrentPage(1); // Reset to first page on search
    }, 500);

    return () => clearTimeout(handler);
  }, [searchInput]);

  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await labourService.getWorkers({
      status: statusFilter,
      skill: skillFilter || undefined,
      search: searchTerm,
      page: currentPage,
      per_page: ITEMS_PER_PAGE
    });
    if (result.success) {
      setWorkers(result.data);
      setTotalWorkers(result.total || 0);
      setTotalPages(Math.ceil((result.total || 0) / ITEMS_PER_PAGE));
      setError(null);
    } else {
      const errorMsg = result.message || 'Failed to fetch workers';
      setError(errorMsg);
      showError(errorMsg);
      setWorkers([]);
    }
    setLoading(false);
  }, [statusFilter, skillFilter, searchTerm, currentPage]);

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  // Fetch all unique skills from workers in DB (once at mount)
  useEffect(() => {
    const fetchAllSkills = async () => {
      // Fetch a large batch of workers to get all unique skills
      const result = await labourService.getWorkers({
        status: '', // All statuses
        per_page: 500 // Get many workers to extract skills
      });
      if (result.success && result.data) {
        const skills = result.data.flatMap(w => w.skills || []);
        const uniqueSkills = [...new Set(skills)];
        setAllSkillsFromDB(uniqueSkills);
      }
    };
    fetchAllSkills();
  }, []);

  // Keyboard accessibility - close modals on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showViewModal) {
          setShowViewModal(false);
          setViewingWorker(null);
        }
        if (showAddModal) {
          setShowAddModal(false);
          resetForm();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showViewModal, showAddModal]);

  const handleAddSkill = () => {
    const trimmedSkill = skillInput.trim();
    if (trimmedSkill && !formData.skills?.includes(trimmedSkill)) {
      setFormData({
        ...formData,
        skills: [...(formData.skills || []), trimmedSkill]
      });
      setSkillInput('');
      setShowSkillDropdown(false);
    }
  };

  const handleSelectSkill = (skill: string) => {
    if (!formData.skills?.includes(skill)) {
      setFormData({
        ...formData,
        skills: [...(formData.skills || []), skill]
      });
    }
    setSkillInput('');
    setShowSkillDropdown(false);
  };

  const handleRemoveSkill = (skill: string) => {
    setFormData({
      ...formData,
      skills: formData.skills?.filter(s => s !== skill) || []
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Combine country code with phone number
    const fullPhone = formData.phone ? `${countryCode}${formData.phone}` : '';
    const submissionData = {
      ...formData,
      phone: fullPhone
    };

    if (editingWorker) {
      const result = await labourService.updateWorker(editingWorker.worker_id, submissionData);
      if (result.success) {
        showSuccess('Worker updated successfully');
        setShowAddModal(false);
        setEditingWorker(null);
        fetchWorkers();
      } else {
        showError(result.message || 'Failed to update worker');
      }
    } else {
      const result = await labourService.createWorker(submissionData);
      if (result.success) {
        showSuccess('Worker added successfully');
        setShowAddModal(false);
        fetchWorkers();
      } else {
        showError(result.message || 'Failed to add worker');
      }
    }
    resetForm();
  };

  const handleView = (worker: Worker) => {
    setViewingWorker(worker);
    setShowViewModal(true);
  };

  const handleEdit = (worker: Worker) => {
    setEditingWorker(worker);

    // Parse phone number to extract country code
    let phoneNumber = worker.phone || '';
    let detectedCountryCode = '+971'; // Default UAE

    if (phoneNumber) {
      // Remove all non-digits except +
      const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');

      // Try to detect country code
      for (const option of countryCodeOptions) {
        if (cleanPhone.startsWith(option.code)) {
          detectedCountryCode = option.code;
          phoneNumber = cleanPhone.slice(option.code.length);
          break;
        }
      }
    }

    setCountryCode(detectedCountryCode);
    setFormData({
      full_name: worker.full_name,
      phone: phoneNumber,
      email: worker.email || '',
      hourly_rate: worker.hourly_rate,
      skills: worker.skills || [],
      worker_type: worker.worker_type,
      status: worker.status,
      emergency_contact: worker.emergency_contact || '',
      emergency_phone: worker.emergency_phone || '',
      id_number: worker.id_number || '',
      notes: worker.notes || ''
    });
    setShowAddModal(true);
  };

  const handleDelete = async (workerId: number) => {
    if (!confirm('Are you sure you want to delete this worker?')) return;
    const result = await labourService.deleteWorker(workerId);
    if (result.success) {
      showSuccess('Worker deleted successfully');
      fetchWorkers();
    } else {
      showError(result.message || 'Failed to delete worker');
    }
  };

  const resetForm = () => {
    setFormData({
      full_name: '',
      phone: '',
      email: '',
      hourly_rate: 0,
      skills: [],
      worker_type: 'regular',
      status: 'active',
      emergency_contact: '',
      emergency_phone: '',
      id_number: '',
      notes: ''
    });
    setCountryCode('+971'); // Reset to default UAE
    setEditingWorker(null);
    setSkillInput('');
    setShowSkillDropdown(false);
  };

  // Default skills + dynamically extracted from all workers in DB
  const defaultSkills = ['Mason', 'Carpenter', 'Helper', 'Electrician', 'Plumber', 'Welder', 'Painter', 'Fitter'];

  // Combine default skills with skills from DB
  const skillOptions = React.useMemo(() => {
    const allSkills = [...new Set([...defaultSkills, ...allSkillsFromDB])];
    return allSkills.sort((a, b) => a.localeCompare(b));
  }, [allSkillsFromDB]);

  // Filter skills based on input and exclude already selected
  const filteredSkillOptions = React.useMemo(() => {
    const searchLower = skillInput.toLowerCase().trim();
    return skillOptions
      .filter(skill => !formData.skills?.includes(skill))
      .filter(skill => !searchLower || skill.toLowerCase().includes(searchLower));
  }, [skillOptions, skillInput, formData.skills]);

  const countryCodeOptions = [
    { code: '+971', name: 'UAE', flag: '🇦🇪' },
    { code: '+91', name: 'India', flag: '🇮🇳' },
    { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
    { code: '+880', name: 'Bangladesh', flag: '🇧🇩' },
    { code: '+63', name: 'Philippines', flag: '🇵🇭' },
    { code: '+94', name: 'Sri Lanka', flag: '🇱🇰' },
    { code: '+977', name: 'Nepal', flag: '🇳🇵' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Labour Registry</h1>
        <p className="text-gray-600">Manage workers in the labour registry</p>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search workers..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1); // Reset to first page on filter change
          }}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="on_leave">On Leave</option>
        </select>
        <select
          value={skillFilter}
          onChange={(e) => {
            setSkillFilter(e.target.value);
            setCurrentPage(1); // Reset to first page on filter change
          }}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
        >
          <option value="">All Skills</option>
          {skillOptions.map((skill) => (
            <option key={skill} value={skill}>{skill}</option>
          ))}
        </select>
        <button
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          Add Worker
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-1">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button
              onClick={fetchWorkers}
              className="ml-4 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Workers Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      ) : workers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <UserPlusIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No workers found</h3>
          <p className="mt-1 text-sm text-gray-500">Add workers to the registry to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Worker Code
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rate (AED/hr)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Skills
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {workers.map((worker) => (
                  <tr key={worker.worker_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {worker.worker_code}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                      {worker.full_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {worker.phone || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {worker.hourly_rate}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div className="flex flex-wrap gap-1">
                        {worker.skills && worker.skills.length > 0 ? (
                          <>
                            {worker.skills.slice(0, 2).map((skill, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded whitespace-nowrap">
                                {skill}
                              </span>
                            ))}
                            {worker.skills.length > 2 && (
                              <span className="text-xs text-gray-500">+{worker.skills.length - 2}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        worker.status === 'active' ? 'bg-green-100 text-green-800' :
                        worker.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {worker.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleView(worker)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                          title="View details"
                        >
                          <EyeIcon className="w-4 h-4" />
                          View
                        </button>
                        <button
                          onClick={() => handleEdit(worker)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                          title="Edit worker"
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(worker.worker_id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete worker"
                        >
                          <TrashIcon className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalWorkers > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              {/* Mobile Pagination */}
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || loading}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>

              {/* Desktop Pagination */}
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{' '}
                    <span className="font-medium">{Math.min(currentPage * ITEMS_PER_PAGE, totalWorkers)}</span> of{' '}
                    <span className="font-medium">{totalWorkers}</span> workers
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || loading}
                      className="relative inline-flex items-center px-3 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous
                    </button>
                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || loading}
                      className="relative inline-flex items-center px-3 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">
                {editingWorker ? 'Edit Worker' : 'Add New Worker'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone (for WhatsApp)</label>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="w-32 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-sm"
                    >
                      {countryCodeOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.flag} {option.code}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      placeholder="501234567"
                      value={formData.phone}
                      onChange={(e) => {
                        // Only allow digits
                        const value = e.target.value.replace(/\D/g, '');
                        setFormData({ ...formData, phone: value });
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Full number: {countryCode}{formData.phone || 'XXXXXXXXX'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate (AED) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.hourly_rate || ''}
                    placeholder="0.00"
                    onChange={(e) => setFormData({ ...formData, hourly_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Skills</label>

                {/* Professional Custom Dropdown */}
                <div className="relative">
                  <div className="flex gap-2 mb-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        placeholder="Search or type a new skill..."
                        value={skillInput}
                        onChange={(e) => {
                          setSkillInput(e.target.value);
                          setShowSkillDropdown(true);
                        }}
                        onFocus={() => setShowSkillDropdown(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSkill();
                          }
                          if (e.key === 'Escape') {
                            setShowSkillDropdown(false);
                          }
                        }}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSkillDropdown(!showSkillDropdown)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                      >
                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${showSkillDropdown ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddSkill}
                      disabled={!skillInput.trim()}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Add
                    </button>
                  </div>

                  {/* Dropdown Menu */}
                  {showSkillDropdown && filteredSkillOptions.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredSkillOptions.map((skill) => (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => handleSelectSkill(skill)}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 flex items-center justify-between transition-colors"
                        >
                          <span>{skill}</span>
                          {formData.skills?.includes(skill) && (
                            <CheckIcon className="w-4 h-4 text-purple-600" />
                          )}
                        </button>
                      ))}
                      {skillInput.trim() && !skillOptions.includes(skillInput.trim()) && (
                        <button
                          type="button"
                          onClick={handleAddSkill}
                          className="w-full px-3 py-2 text-left text-sm text-purple-600 hover:bg-purple-50 border-t border-gray-100 font-medium"
                        >
                          + Add "{skillInput.trim()}" as new skill
                        </button>
                      )}
                    </div>
                  )}

                  {/* Show "Add new" option when no matches */}
                  {showSkillDropdown && filteredSkillOptions.length === 0 && skillInput.trim() && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                      <button
                        type="button"
                        onClick={handleAddSkill}
                        className="w-full px-3 py-2 text-left text-sm text-purple-600 hover:bg-purple-50 font-medium"
                      >
                        + Add "{skillInput.trim()}" as new skill
                      </button>
                    </div>
                  )}
                </div>

                {/* Click outside to close dropdown */}
                {showSkillDropdown && (
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowSkillDropdown(false)}
                  />
                )}

                {/* Selected Skills Tags */}
                {formData.skills && formData.skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.skills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 text-sm rounded-md border border-gray-200"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() => handleRemoveSkill(skill)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Worker Type</label>
                  <select
                    value={formData.worker_type}
                    onChange={(e) => setFormData({ ...formData, worker_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="regular">Regular</option>
                    <option value="contract">Contract</option>
                    <option value="temporary">Temporary</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' | 'on_leave' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on_leave">On Leave</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
                <input
                  type="text"
                  value={formData.id_number}
                  onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
                  <input
                    type="text"
                    value={formData.emergency_contact}
                    onChange={(e) => setFormData({ ...formData, emergency_contact: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Phone</label>
                  <input
                    type="tel"
                    value={formData.emergency_phone}
                    onChange={(e) => setFormData({ ...formData, emergency_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  {editingWorker ? 'Update Worker' : 'Add Worker'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* View Worker Modal */}
      {showViewModal && viewingWorker && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowViewModal(false);
              setViewingWorker(null);
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Worker Details</h2>
                <p className="text-sm text-gray-500 mt-0.5">{viewingWorker.worker_code}</p>
              </div>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingWorker(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5">
              {/* Worker Name and Status */}
              <div className="flex items-start justify-between mb-6 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                    <UserIcon className="w-8 h-8 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{viewingWorker.full_name}</h3>
                    <p className="text-sm text-gray-500 capitalize">{viewingWorker.worker_type} Worker</p>
                  </div>
                </div>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                  viewingWorker.status === 'active' ? 'bg-green-50 text-green-700 border border-green-200' :
                  viewingWorker.status === 'inactive' ? 'bg-gray-50 text-gray-700 border border-gray-200' :
                  'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {viewingWorker.status === 'active' ? 'Active' :
                   viewingWorker.status === 'inactive' ? 'Inactive' : 'On Leave'}
                </span>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contact Information */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-900 uppercase tracking-wide">Contact Information</h4>

                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <PhoneIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Phone</p>
                      <p className="text-sm text-gray-900">{viewingWorker.phone || 'Not provided'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <IdentificationIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">ID Number</p>
                      <p className="text-sm text-gray-900">{viewingWorker.id_number || 'Not provided'}</p>
                    </div>
                  </div>
                </div>

                {/* Work Information */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-900 uppercase tracking-wide">Work Information</h4>

                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <CurrencyDollarIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Hourly Rate</p>
                      <p className="text-sm font-medium text-gray-900">AED {(viewingWorker.hourly_rate ?? 0).toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <UserIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Worker Type</p>
                      <p className="text-sm text-gray-900 capitalize">{viewingWorker.worker_type}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <CalendarIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Added On</p>
                      <p className="text-sm text-gray-900">
                        {viewingWorker.created_at
                          ? new Date(viewingWorker.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })
                          : 'Not available'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Skills Section */}
              {viewingWorker.skills && viewingWorker.skills.length > 0 && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <h4 className="text-sm font-medium text-gray-900 uppercase tracking-wide mb-3">Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {viewingWorker.skills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Emergency Contact */}
              <div className="mt-5 pt-4 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-900 uppercase tracking-wide mb-3">Emergency Contact</h4>
                <div className={`flex items-start gap-3 p-3 rounded-lg border ${
                  viewingWorker.emergency_contact || viewingWorker.emergency_phone
                    ? 'bg-red-50 border-red-100'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <ExclamationTriangleIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    viewingWorker.emergency_contact || viewingWorker.emergency_phone
                      ? 'text-red-400'
                      : 'text-gray-400'
                  }`} />
                  <div>
                    <p className="text-xs text-gray-500">Contact Name</p>
                    <p className="text-sm font-medium text-gray-900">{viewingWorker.emergency_contact || 'Not provided'}</p>
                    <p className="text-xs text-gray-500 mt-2">Contact Phone</p>
                    <p className="text-sm text-gray-700">{viewingWorker.emergency_phone || 'Not provided'}</p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {viewingWorker.notes && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <h4 className="text-sm font-medium text-gray-900 uppercase tracking-wide mb-3">Notes</h4>
                  <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <DocumentTextIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{viewingWorker.notes}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex gap-3 p-5 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setShowViewModal(false);
                  setViewingWorker(null);
                }}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowViewModal(false);
                  handleEdit(viewingWorker);
                }}
                className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                Edit Worker
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default LabourRegistry;
