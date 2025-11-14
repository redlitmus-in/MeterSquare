import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Search,
  UserCheck,
  CheckCircle,
  Package,
  AlertCircle,
  Edit2,
  Trash2,
  User,
  Briefcase,
  Phone,
  Mail,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAvailableSiteEngineers, assignItemsToSE } from '@/services/boqAssignmentService';
import { apiClient } from '@/api/config';
import { projectManagerService } from '@/roles/project-manager/services/projectManagerService';

// Constants
const MAX_PROJECTS_PER_SE = 3;
const MIN_PHONE_LENGTH = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_VISIBLE_PROJECTS = 2;

interface SiteEngineer {
  user_id: number;
  full_name?: string;
  sitesupervisor_name?: string;
  email: string;
  phone?: string;
  phone_number?: string;
  project_count?: number;
  projects_count?: number;
  project_id?: number | null;
  project_name?: string | null;
  is_active?: boolean;
  user_status?: 'online' | 'offline' | 'busy';
  total_projects?: number;
  items_assigned_count?: number;
  profile_image?: string;
  completed_projects_count?: number;
  projects?: Array<{
    project_id: number;
    project_name: string;
    status?: string;
  }>;
}

interface BOQItem {
  id?: number;
  item_name?: string;
  item_code?: string;
  itemCode?: string;
  code?: string;
  description?: string;
  briefDescription?: string;
  itemDescription?: string;
  scope?: string;
  unit?: string;
  quantity?: number;
  qty?: number;
  rate?: number;
  unitRate?: number;
  amount?: number;
  totalAmount?: number;
  base_cost?: number;
  actualItemCost?: number;
  item_total?: number;
  materials?: any[];
  labour?: any[];
  sub_items?: any[];
  has_sub_items?: boolean;
  [key: string]: any; // Allow any other fields
}

interface AssignItemToSEModalProps {
  isOpen: boolean;
  onClose: () => void;
  boqId: number;
  boqName: string;
  projectName: string;
  selectedItemIndices: number[];
  onSuccess: () => void;
}

const AssignItemToSEModal: React.FC<AssignItemToSEModalProps> = ({
  isOpen,
  onClose,
  boqId,
  boqName,
  projectName,
  selectedItemIndices: initialSelectedItems,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'select' | 'create'>('select');
  const [siteEngineers, setSiteEngineers] = useState<SiteEngineer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSE, setSelectedSE] = useState<SiteEngineer | null>(null);
  const [selectedItemIndices, setSelectedItemIndices] = useState<number[]>(initialSelectedItems);
  const [selectAll, setSelectAll] = useState(false);
  const [boqItems, setBoqItems] = useState<BOQItem[]>([]);
  const [existingAssignments, setExistingAssignments] = useState<Record<number, { se_name: string; se_id: number }>>({});

  // Create new SE form state
  const [newSEForm, setNewSEForm] = useState({
    full_name: '',
    email: '',
    phone: ''
  });
  const [creating, setCreating] = useState(false);

  // Edit SE state
  const [editingSE, setEditingSE] = useState<SiteEngineer | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    phone: ''
  });
  const [updating, setUpdating] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Fetch available site engineers
  useEffect(() => {
    if (isOpen && activeTab === 'select') {
      fetchSiteEngineers();
    }
  }, [isOpen, activeTab]);

  // Fetch BOQ items when modal opens
  useEffect(() => {
    if (isOpen && boqId) {
      fetchBOQItems();
    }
  }, [isOpen, boqId]);

  // Update selected items when props change
  useEffect(() => {
    setSelectedItemIndices(initialSelectedItems);
  }, [initialSelectedItems]);

  // Auto-select all items when SE is selected AND items are loaded
  useEffect(() => {
    if (selectedSE && boqItems.length > 0) {
      // If no initial items specified, select all BOQ items
      const itemsToSelect = initialSelectedItems.length > 0
        ? initialSelectedItems
        : Array.from({ length: boqItems.length }, (_, i) => i);

      setSelectedItemIndices(itemsToSelect);
      setSelectAll(itemsToSelect.length === boqItems.length);
    }
  }, [selectedSE, boqItems, initialSelectedItems]);

  const fetchSiteEngineers = async () => {
    setLoading(true);
    try {
      const engineers = await getAvailableSiteEngineers();
      setSiteEngineers(engineers);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load site engineers');
    } finally {
      setLoading(false);
    }
  };

  const fetchBOQItems = async () => {
    setLoadingItems(true);
    try {
      const response = await apiClient.get(`/boq/${boqId}`);

      // Handle different BOQ response formats
      const items =
        response.data?.existing_purchase?.items ||
        response.data?.new_purchase?.items ||
        response.data?.items ||
        [];

      setBoqItems(items);

      // Extract existing assignments from items
      const assignments: Record<number, { se_name: string; se_id: number }> = {};
      items.forEach((item: any, index: number) => {
        if (item.assigned_to_se_user_id && item.assigned_to_se_name) {
          assignments[index] = {
            se_name: item.assigned_to_se_name,
            se_id: item.assigned_to_se_user_id
          };
        }
      });
      setExistingAssignments(assignments);
    } catch (error: any) {
      toast.error('Failed to load BOQ items');
    } finally {
      setLoadingItems(false);
    }
  };

  const handleAssignment = async () => {
    if (!selectedSE) {
      toast.error('Please select a Site Engineer');
      return;
    }

    if (selectedItemIndices.length === 0) {
      toast.error('Please select at least one item to assign');
      return;
    }

    setAssigning(true);
    try {
      await assignItemsToSE(boqId, selectedItemIndices, selectedSE.user_id);
      toast.success(`Successfully assigned ${selectedItemIndices.length} item(s) to ${selectedSE.full_name}`);
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to assign items');
    } finally {
      setAssigning(false);
    }
  };

  const toggleItemSelection = (index: number) => {
    setSelectedItemIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedItemIndices([]);
    } else {
      const allIndices = initialSelectedItems.length > 0
        ? initialSelectedItems
        : Array.from({ length: boqItems.length }, (_, i) => i);
      setSelectedItemIndices(allIndices);
    }
    setSelectAll(!selectAll);
  };

  // Validation helper
  const validateSEForm = useCallback((form: { full_name: string; email: string; phone: string }) => {
    if (!form.full_name || !form.email || !form.phone) {
      toast.error('Please fill in all fields');
      return false;
    }

    if (!EMAIL_REGEX.test(form.email)) {
      toast.error('Please enter a valid email address');
      return false;
    }

    if (form.phone.length < MIN_PHONE_LENGTH) {
      toast.error(`Phone number must be at least ${MIN_PHONE_LENGTH} digits`);
      return false;
    }

    return true;
  }, []);

  const handleCreateSE = async () => {
    if (!validateSEForm(newSEForm)) return;

    setCreating(true);
    try {
      const response = await projectManagerService.createSiteSupervisor(newSEForm);
      toast.success('Site Engineer created successfully');

      setNewSEForm({ full_name: '', email: '', phone: '' });
      await fetchSiteEngineers();
      setActiveTab('select');

      const newSE = response.site_supervisor || response;
      if (newSE?.user_id) {
        setSelectedSE(newSE);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create Site Engineer');
    } finally {
      setCreating(false);
    }
  };

  const handleEditSE = (se: SiteEngineer) => {
    setEditingSE(se);
    setEditForm({
      full_name: se.full_name || se.sitesupervisor_name || '',
      email: se.email,
      phone: se.phone || se.phone_number || ''
    });
  };

  const handleUpdateSE = async () => {
    if (!editingSE || !validateSEForm(editForm)) return;

    setUpdating(true);
    try {
      await projectManagerService.updateSiteSupervisor(editingSE.user_id, editForm);
      toast.success('Site Engineer updated successfully');

      setEditingSE(null);
      await fetchSiteEngineers();

      if (selectedSE?.user_id === editingSE.user_id) {
        setSelectedSE({
          ...selectedSE,
          full_name: editForm.full_name,
          email: editForm.email,
          phone: editForm.phone
        });
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update Site Engineer');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteSE = async (se: SiteEngineer) => {
    const seName = se.full_name || se.sitesupervisor_name;
    if (!window.confirm(`Are you sure you want to delete ${seName}?`)) return;

    try {
      await projectManagerService.deleteSiteSupervisor(se.user_id);
      toast.success('Site Engineer deleted successfully');

      await fetchSiteEngineers();

      if (selectedSE?.user_id === se.user_id) {
        setSelectedSE(null);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to delete Site Engineer');
    }
  };

  const filteredEngineers = siteEngineers.filter((se) => {
    const name = se.full_name || se.sitesupervisor_name || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      se.email.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Helper: Get SE name
  const getSEName = useCallback((se: SiteEngineer) => se.full_name || se.sitesupervisor_name || 'SE', []);

  // Helper: Get SE phone
  const getSEPhone = useCallback((se: SiteEngineer) => se.phone || se.phone_number, []);

  // Helper: Filter ongoing/completed projects
  const getProjectsByStatus = useCallback((projects: SiteEngineer['projects'], completed: boolean = false) => {
    return projects?.filter(p => completed ? p.status?.toLowerCase() === 'completed' : p.status?.toLowerCase() !== 'completed') || [];
  }, []);

  // Helper: Get status color
  const getStatusColor = useCallback((status: string) => {
    const colors = {
      online: 'bg-green-500',
      busy: 'bg-yellow-500',
      offline: 'bg-gray-400'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-400';
  }, []);

  // Helper: Get availability badge
  const getAvailabilityBadge = useCallback((projectCount: number) => {
    if (projectCount < MAX_PROJECTS_PER_SE - 1) {
      return { label: 'Available', color: 'bg-green-100 text-green-800 border-green-200' };
    }
    if (projectCount === MAX_PROJECTS_PER_SE) {
      return { label: 'Fully Loaded', color: 'bg-red-100 text-red-800 border-red-200' };
    }
    return { label: 'Busy', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
  }, []);

  // Helper: Get item code
  const getItemCode = useCallback((item: BOQItem | undefined, index: number) => {
    if (!item) return `Item #${index + 1}`;
    return item.item_name || item.item_code || item.itemCode || item.code || `Item #${index + 1}`;
  }, []);

  // Helper: Get item description
  const getItemDescription = useCallback((item: BOQItem | undefined) => {
    if (!item) return 'No description';

    // Check if item has sub_items and get their scope
    if (item.sub_items && Array.isArray(item.sub_items) && item.sub_items.length > 0) {
      const scopes = item.sub_items
        .map((si: any) => si.scope || si.sub_item_name)
        .filter(Boolean)
        .join(', ');
      if (scopes) return scopes;
    }

    return item.description || item.briefDescription || item.itemDescription || item.scope || 'No description';
  }, []);

  // Helper: Get item quantity
  const getItemQuantity = useCallback((item: BOQItem | undefined) => {
    if (!item) return 0;
    return item.quantity || item.qty || 1;
  }, []);

  // Helper: Get item unit
  const getItemUnit = useCallback((item: BOQItem | undefined) => {
    if (!item) return 'nos';
    return item.unit || 'nos';
  }, []);

  // Helper: Get item rate
  const getItemRate = useCallback((item: BOQItem | undefined) => {
    if (!item) return 0;
    return item.rate || item.unitRate || item.base_cost || item.actualItemCost || 0;
  }, []);

  // Helper: Get item amount
  const getItemAmount = useCallback((item: BOQItem | undefined) => {
    if (!item) return 0;
    return item.amount || item.totalAmount || item.item_total || item.actualItemCost || item.base_cost || 0;
  }, []);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-hidden"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Assign Site Engineer</h2>
                <p className="text-blue-100 text-sm mt-1">
                  {boqName} • {projectName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200 bg-gray-50 px-6">
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('select')}
                className={`px-6 py-3 font-medium text-sm transition-all relative ${
                  activeTab === 'select'
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <User className="w-4 h-4 inline mr-2" />
                Select Existing SE
                {activeTab === 'select' && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"
                  />
                )}
              </button>
              <button
                onClick={() => setActiveTab('create')}
                className={`px-6 py-3 font-medium text-sm transition-all relative ${
                  activeTab === 'create'
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <UserCheck className="w-4 h-4 inline mr-2" />
                Create New SE
                {activeTab === 'create' && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"
                  />
                )}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin" style={{ overscrollBehavior: 'contain' }}>
            <div className={`grid gap-6 p-6 ${activeTab === 'select' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
              {/* Left Side - SE Selection */}
              <div className="flex flex-col">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    {activeTab === 'select' ? 'Available Site Engineers' : 'Create New Site Engineer'}
                  </h3>

                  {activeTab === 'select' && (
                    <>
                      {/* Search Bar */}
                      <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search SE..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>

                      {/* SE List */}
                      <div className="space-y-3">
                        {loading ? (
                          <div className="flex items-center justify-center py-12">
                            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : filteredEngineers.length === 0 ? (
                          <div className="text-center py-12">
                            <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500">No site engineers found</p>
                          </div>
                        ) : (
                          filteredEngineers.map((se) => {
                            const ongoingProjects = getProjectsByStatus(se.projects);
                            const completedProjects = getProjectsByStatus(se.projects, true);
                            const maxProjects = se.total_projects || MAX_PROJECTS_PER_SE;
                            const availability = getAvailabilityBadge(ongoingProjects.length);
                            const isSelected = selectedSE?.user_id === se.user_id;
                            const seName = getSEName(se);
                            const sePhone = getSEPhone(se);

                            return (
                              <motion.div
                                key={se.user_id}
                                whileHover={{ scale: 1.02 }}
                                onClick={() => setSelectedSE(se)}
                                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                  isSelected
                                    ? 'border-blue-500 bg-blue-50 shadow-md'
                                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                                }`}
                              >
                                <div className="flex flex-col gap-3">
                                  <div className="flex items-start gap-3">
                                    {/* Avatar */}
                                    <div className="relative">
                                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                                        {seName.charAt(0).toUpperCase()}
                                      </div>
                                      <div
                                        className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${getStatusColor(
                                          se.user_status || (se.is_active ? 'online' : 'offline')
                                        )}`}
                                      />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                          <h4 className="font-semibold text-gray-900 truncate">
                                            {seName}
                                          </h4>
                                          <span
                                            className={`px-2 py-0.5 rounded-full text-xs font-medium border ${availability.color}`}
                                          >
                                            {availability.label}
                                          </span>
                                        </div>
                                        {isSelected && (
                                          <CheckCircle className="w-5 h-5 text-blue-600 fill-blue-600 flex-shrink-0" />
                                        )}
                                      </div>

                                      <div className="space-y-1 text-sm text-gray-600">
                                        <div className="flex items-center gap-2">
                                          <Mail className="w-3.5 h-3.5" />
                                          <span className="truncate">{se.email}</span>
                                        </div>
                                        {sePhone && (
                                          <div className="flex items-center gap-2">
                                            <Phone className="w-3.5 h-3.5" />
                                            <span>{sePhone}</span>
                                          </div>
                                        )}

                                        {/* Detailed Project Stats */}
                                        <div className="flex items-center gap-2">
                                          <Briefcase className="w-3.5 h-3.5" />
                                          <div className="flex items-center gap-1.5">
                                            <span className="font-medium text-blue-600">
                                              {ongoingProjects.length} ongoing
                                            </span>
                                            {completedProjects.length > 0 && (
                                              <>
                                                <span className="text-gray-400">•</span>
                                                <span className="text-green-600">
                                                  {completedProjects.length} completed
                                                </span>
                                              </>
                                            )}
                                            <span className="text-gray-400">•</span>
                                            <span className="text-gray-500">
                                              {maxProjects - ongoingProjects.length} slots free
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Projects List - Only show ongoing projects */}
                                      {ongoingProjects.length > 0 && (
                                        <div className="mt-2 text-xs text-gray-500">
                                          <span className="font-medium">Current projects:</span>
                                          <div className="mt-1 space-y-0.5">
                                            {ongoingProjects.slice(0, MAX_VISIBLE_PROJECTS).map((project) => (
                                              <div key={project.project_id} className="truncate">
                                                • {project.project_name}
                                              </div>
                                            ))}
                                            {ongoingProjects.length > MAX_VISIBLE_PROJECTS && (
                                              <div className="text-blue-600">
                                                +{ongoingProjects.length - MAX_VISIBLE_PROJECTS} more
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditSE(se);
                                      }}
                                      className="flex-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-xs font-medium flex items-center justify-center gap-1.5"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                      Edit
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteSE(se);
                                      }}
                                      className="flex-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-xs font-medium flex items-center justify-center gap-1.5"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}

                  {activeTab === 'create' && (
                    <div className="space-y-4">
                      {/* Full Name Input */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newSEForm.full_name}
                          onChange={(e) => setNewSEForm({ ...newSEForm, full_name: e.target.value })}
                          placeholder="Enter full name"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>

                      {/* Email Input */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={newSEForm.email}
                          onChange={(e) => setNewSEForm({ ...newSEForm, email: e.target.value })}
                          placeholder="sitesupervisor@example.com"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>

                      {/* Phone Input */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Phone Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          value={newSEForm.phone}
                          onChange={(e) => setNewSEForm({ ...newSEForm, phone: e.target.value })}
                          placeholder="+91 9876543210"
                          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        />
                      </div>

                      {/* Info Box */}
                      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                          <div className="text-sm text-blue-900">
                            <p className="font-medium mb-1">New Site Engineer</p>
                            <p className="text-blue-700">
                              A new Site Engineer account will be created with the provided details.
                              They will receive login credentials via email.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Create Button */}
                      <button
                        onClick={handleCreateSE}
                        disabled={creating || !newSEForm.full_name || !newSEForm.email || !newSEForm.phone}
                        className="w-full mt-4 px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-green-700 text-white font-medium hover:from-green-700 hover:to-green-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {creating ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-5 h-5" />
                            Create & Select SE
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side - Selected Items (only show on Select tab) */}
              {activeTab === 'select' && (
                <div className="flex flex-col border-l border-gray-200 pl-6">
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Items to Assign ({selectedItemIndices.length}/{initialSelectedItems.length > 0 ? initialSelectedItems.length : boqItems.length})
                      </h3>

                      {/* Info Icons with Tooltips */}
                      <div className="flex items-center gap-1">
                        {/* Select SE Info */}
                        {!selectedSE && (
                          <div className="group relative">
                            <AlertCircle className="w-5 h-5 text-yellow-600 cursor-help" />
                            <div className="absolute left-0 top-7 w-72 p-3 bg-yellow-50 border border-yellow-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                              <p className="font-medium text-sm text-yellow-900">Select a Site Engineer</p>
                              <p className="text-xs text-yellow-700 mt-1">
                                Please select a Site Engineer from the left panel. All BOQ items will be automatically selected for assignment.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Project Assignment Limit Info */}
                        <div className="group relative">
                          <AlertCircle className="w-5 h-5 text-blue-600 cursor-help" />
                          <div className="absolute left-0 top-7 w-80 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                            <p className="font-medium text-sm text-blue-900">Project Assignment Limit</p>
                            <p className="text-xs text-blue-700 mt-1">
                              Each Site Engineer can be assigned to a maximum of {MAX_PROJECTS_PER_SE} projects. The assigned SE will gain full access to manage this project.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                  {/* Select All Checkbox */}
                  {(initialSelectedItems.length > 1 || boqItems.length > 1) && (
                    <div className="mb-3 p-3 bg-gray-50 rounded-lg flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleSelectAll}
                        className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
                      />
                      <label className="text-sm font-medium text-gray-700">
                        Select all items ({initialSelectedItems.length > 0 ? initialSelectedItems.length : boqItems.length})
                      </label>
                    </div>
                  )}

                  {/* Items List */}
                  <div className="space-y-2">
                    {loadingItems ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                      </div>
                    ) : boqItems.length === 0 ? (
                      <div className="text-center py-12">
                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">
                          {!selectedSE ? 'Select a Site Engineer to view items' : 'No items available'}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          {!selectedSE
                            ? 'All BOQ items will be shown when you select an SE'
                            : 'This BOQ has no items to assign'}
                        </p>
                      </div>
                    ) : (
                      (initialSelectedItems.length > 0 ? initialSelectedItems : Array.from({ length: boqItems.length }, (_, i) => i)).map((index) => {
                        const item = boqItems[index];
                        const isSelected = selectedItemIndices.includes(index);
                        const existingAssignment = existingAssignments[index];
                        const isAssignedToOther = existingAssignment && existingAssignment.se_id !== selectedSE?.user_id;
                        const isAssignedToCurrentSE = existingAssignment && existingAssignment.se_id === selectedSE?.user_id;

                        return (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            onClick={() => !isAssignedToOther && toggleItemSelection(index)}
                            className={`p-4 rounded-lg border-2 transition-all ${
                              isAssignedToOther
                                ? 'border-gray-300 bg-gray-50 opacity-60 cursor-not-allowed'
                                : isSelected
                                ? 'border-blue-500 bg-blue-50 cursor-pointer'
                                : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
                            }`}
                          >
                            {/* Item Info */}
                            <div className="w-full">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Package className="w-5 h-5 text-gray-400" />
                                  <span className="font-semibold text-gray-900 text-base">
                                    {getItemCode(item, index)}
                                  </span>
                                  {existingAssignment && (
                                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                      isAssignedToCurrentSE
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-orange-100 text-orange-700'
                                    }`}>
                                      {isAssignedToCurrentSE ? '✓ Already Assigned' : `Assigned to: ${existingAssignment.se_name}`}
                                    </span>
                                  )}
                                </div>
                                {isSelected && !isAssignedToOther && (
                                  <CheckCircle className="w-5 h-5 text-blue-600 fill-blue-600 flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-sm text-gray-700 mb-3">
                                {getItemDescription(item)}
                              </p>
                              <div className="grid grid-cols-3 gap-3 text-sm">
                                <div className="flex flex-col">
                                  <span className="text-gray-500 text-xs mb-1">Quantity</span>
                                  <span className="font-medium text-gray-900">
                                    {getItemQuantity(item)} {getItemUnit(item)}
                                  </span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-gray-500 text-xs mb-1">Rate</span>
                                  <span className="font-medium text-gray-900">
                                    ₹{getItemRate(item).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-gray-500 text-xs mb-1">Amount</span>
                                  <span className="font-semibold text-blue-600">
                                    ₹{getItemAmount(item).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                              {item?.materials && item.materials.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <span className="text-xs text-gray-500">
                                    Materials: <span className="font-medium text-gray-700">{item.materials.length} item(s)</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
              )}
            </div>
          </div>

          {/* Footer - Only show on Select tab */}
          {activeTab === 'select' && (
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {selectedSE ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span>
                      Assigning to: <span className="font-medium">{getSEName(selectedSE)}</span>
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                    <span>Please select a Site Engineer</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={assigning}
                  className="px-6 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignment}
                  disabled={!selectedSE || selectedItemIndices.length === 0 || assigning}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {assigning ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Confirm Assignment
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Footer for Create tab - Just Close button */}
          {activeTab === 'create' && (
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </motion.div>

        {/* Edit SE Modal */}
        {editingSE && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setEditingSE(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Edit Site Engineer</h3>
                <button
                  onClick={() => setEditingSE(null)}
                  className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.full_name}
                    onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                    placeholder="Enter full name"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="sitesupervisor@example.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="+91 9876543210"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setEditingSE(null)}
                    disabled={updating}
                    className="flex-1 px-6 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateSE}
                    disabled={updating || !editForm.full_name || !editForm.email || !editForm.phone}
                    className="flex-1 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {updating ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Update
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  );
};

export default AssignItemToSEModal;
