/**
 * Worker Assignments Page
 * Production Manager: Assign workers to approved requisitions (Step 4)
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { labourService, LabourRequisition, Worker, CreateWorkerData } from '@/services/labourService';
import { showSuccess, showError } from '@/utils/toastHelper';
import {
  UserPlusIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  XMarkIcon,
  EyeIcon,
  ClockIcon,
  UserGroupIcon,
  CalendarIcon,
  MapPinIcon,
  UserIcon,
  WrenchScrewdriverIcon,
  UsersIcon,
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { PAGINATION } from '@/lib/inventoryConstants';

// Tab configuration
type TabType = 'pending' | 'assigned';

interface TabConfig {
  key: TabType;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: TabConfig[] = [
  { key: 'pending', label: 'Pending Assignment', color: 'text-yellow-700', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-500', icon: ClockIcon },
  { key: 'assigned', label: 'Assigned', color: 'text-blue-700', bgColor: 'bg-blue-100', borderColor: 'border-blue-500', icon: UserGroupIcon },
];

// WhatsApp Icon Component
const WhatsAppIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

// Helper function to convert 24-hour time to 12-hour format with AM/PM
const formatTimeTo12Hour = (time24: string): string => {
  if (!time24) return '';

  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours, 10);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

  return `${hour12}:${minutes} ${period}`;
};

const WorkerAssignments: React.FC = () => {
  const [requisitions, setRequisitions] = useState<LabourRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedRequisition, setSelectedRequisition] = useState<LabourRequisition | null>(null);
  const [availableWorkers, setAvailableWorkers] = useState<Worker[]>([]);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showQuickSelectDropdown, setShowQuickSelectDropdown] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<'low-rate' | 'high-rate' | 'single-skill' | 'multi-skill' | null>(null);
  const [detailsRequisition, setDetailsRequisition] = useState<LabourRequisition | null>(null);

  // Scroll position preservation
  const workerListRef = React.useRef<HTMLDivElement>(null);
  const [shouldPreserveScroll, setShouldPreserveScroll] = React.useState(false);

  // Add Worker Form State
  const [showAddWorkerForm, setShowAddWorkerForm] = useState(false);
  const [addingWorker, setAddingWorker] = useState(false);
  const [newWorkerData, setNewWorkerData] = useState<CreateWorkerData>({
    full_name: '',
    phone: '',
    hourly_rate: 0,
    skills: []
  });

  // Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  const fetchRequisitions = async () => {
    setLoading(true);
    try {
      const result = await labourService.getApprovedRequisitions(activeTab === 'assigned' ? 'assigned' : 'unassigned');
      if (result.success) {
        setRequisitions(result.data);
      } else {
        showError(result.message || 'Failed to fetch requisitions');
      }
    } catch {
      showError('Failed to fetch requisitions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequisitions();
  }, [activeTab]);

  // Pagination calculations
  const totalPages = Math.ceil(requisitions.length / PAGINATION.DEFAULT_PAGE_SIZE);
  const paginatedRequisitions = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE;
    return requisitions.slice(startIndex, startIndex + PAGINATION.DEFAULT_PAGE_SIZE);
  }, [requisitions, currentPage]);

  // Reset page when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // Clamp page when total pages decreases
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const openAssignModal = async (requisition: LabourRequisition) => {
    setSelectedRequisition(requisition);
    setSelectedWorkerIds([]);
    setSelectedFilter(null); // Reset filter when opening modal
    setShowAssignModal(true);
    setLoadingWorkers(true);
    setShowAddWorkerForm(false);

    // Extract unique skills from labour_items
    let skillsToFetch: string[] = [];
    if (requisition.labour_items && requisition.labour_items.length > 0) {
      // Get all unique skills from labour items
      const uniqueSkills = new Set<string>();
      requisition.labour_items.forEach((item: any) => {
        if (item.skill_required) {
          uniqueSkills.add(item.skill_required);
        }
      });
      skillsToFetch = Array.from(uniqueSkills);
    } else {
      // Fallback to single skill (old format)
      skillsToFetch = [requisition.skill_required];
    }

    setNewWorkerData({
      full_name: '',
      phone: '',
      hourly_rate: 0,
      skills: skillsToFetch
    });

    // Fetch workers for all unique skills
    try {
      const allWorkers: Worker[] = [];
      const workerIds = new Set<number>();

      for (const skill of skillsToFetch) {
        const result = await labourService.getAvailableWorkers(
          skill,
          requisition.required_date,
          requisition.requisition_id
        );
        if (result.success && result.data) {
          // Add workers, avoiding duplicates
          result.data.forEach((worker: Worker) => {
            if (!workerIds.has(worker.worker_id)) {
              allWorkers.push(worker);
              workerIds.add(worker.worker_id);
            }
          });
        }
      }

      setAvailableWorkers(allWorkers);

      // Auto-select preferred workers if they exist and are available
      if (requisition.preferred_worker_ids && requisition.preferred_worker_ids.length > 0) {
        const availablePreferredWorkers = requisition.preferred_worker_ids.filter(
          (prefWorkerId: number) => allWorkers.some((w: Worker) => w.worker_id === prefWorkerId && !w.is_assigned)
        );

        if (availablePreferredWorkers.length > 0) {
          setSelectedWorkerIds(availablePreferredWorkers);
          // Show notification about auto-selection
          const selectedCount = availablePreferredWorkers.length;
          const totalPreferred = requisition.preferred_worker_ids.length;
          if (selectedCount === totalPreferred) {
            showSuccess(`✓ Auto-selected all ${selectedCount} preferred worker(s)`);
          } else {
            showSuccess(`✓ Auto-selected ${selectedCount} of ${totalPreferred} preferred workers (${totalPreferred - selectedCount} unavailable)`);
          }
        }
      }
    } catch (error) {
      showError('Failed to fetch available workers');
    }

    setLoadingWorkers(false);
  };

  const handleAddWorker = async () => {
    const trimmedName = newWorkerData.full_name.trim();
    const trimmedPhone = newWorkerData.phone?.trim() || '';

    if (!trimmedName) {
      showError('Worker name is required');
      return;
    }
    if (newWorkerData.hourly_rate <= 0) {
      showError('Hourly rate must be greater than 0');
      return;
    }

    setAddingWorker(true);
    try {
      const sanitizedData = {
        ...newWorkerData,
        full_name: trimmedName,
        phone: trimmedPhone
      };
      const result = await labourService.createWorker(sanitizedData);

      if (result.success && result.data) {
        showSuccess('Worker added successfully');
        // Add newly created worker to available list and auto-select
        setAvailableWorkers(prev => [...prev, result.data!]);
        setSelectedWorkerIds(prev => [...prev, result.data!.worker_id]);
        setShowAddWorkerForm(false);
        setNewWorkerData({
          full_name: '',
          phone: '',
          hourly_rate: 0,
          skills: selectedRequisition?.skill_required ? [selectedRequisition.skill_required] : []
        });
      } else {
        showError(result.message || 'Failed to add worker');
      }
    } catch {
      showError('An unexpected error occurred while adding worker');
    } finally {
      setAddingWorker(false);
    }
  };

  // Auto-select workers based on filter
  const handleAutoSelect = (filter: 'low-rate' | 'high-rate' | 'single-skill' | 'multi-skill') => {
    const maxWorkers = selectedRequisition?.total_workers_count || selectedRequisition?.workers_count || 0;
    const currentlySelected = selectedWorkerIds.length;
    const remainingSlots = maxWorkers - currentlySelected;

    if (remainingSlots <= 0) {
      showError(`Already selected ${maxWorkers} worker(s). No more slots available.`);
      return;
    }

    // Get available workers (not already assigned AND not currently selected)
    const eligibleWorkers = availableWorkers.filter(w =>
      !w.is_assigned && !selectedWorkerIds.includes(w.worker_id)
    );

    if (eligibleWorkers.length === 0) {
      showError('No available workers to select');
      return;
    }

    let sortedWorkers = [...eligibleWorkers];

    // Apply sorting based on filter
    switch (filter) {
      case 'low-rate':
        // Sort by hourly rate ascending (lowest first)
        sortedWorkers.sort((a, b) => (a.hourly_rate || 0) - (b.hourly_rate || 0));
        break;

      case 'high-rate':
        // Sort by hourly rate descending (highest first)
        sortedWorkers.sort((a, b) => (b.hourly_rate || 0) - (a.hourly_rate || 0));
        break;

      case 'single-skill':
        // Filter and prioritize workers with only one skill
        sortedWorkers = sortedWorkers.filter(w => (w.skills?.length || 0) === 1);
        if (sortedWorkers.length === 0) {
          showError('No single-skill workers available');
          return;
        }
        // Then sort by rate (lowest first for single skill)
        sortedWorkers.sort((a, b) => (a.hourly_rate || 0) - (b.hourly_rate || 0));
        break;

      case 'multi-skill':
        // Filter and prioritize workers with multiple skills
        sortedWorkers = sortedWorkers.filter(w => (w.skills?.length || 0) > 1);
        if (sortedWorkers.length === 0) {
          showError('No multi-skill workers available');
          return;
        }
        // Then sort by rate (lowest first for multi skill)
        sortedWorkers.sort((a, b) => (a.hourly_rate || 0) - (b.hourly_rate || 0));
        break;
    }

    // Select workers to fill remaining slots (keep existing selections)
    const workersToSelect = sortedWorkers.slice(0, remainingSlots);
    const newWorkerIds = workersToSelect.map(w => w.worker_id);

    // Add new selections to existing selections
    setSelectedWorkerIds(prev => [...prev, ...newWorkerIds]);
    setSelectedFilter(filter); // Save the selected filter

    const filterLabels = {
      'low-rate': 'Low Rate',
      'high-rate': 'High Rate',
      'single-skill': 'Single Skill',
      'multi-skill': 'Multi Skill'
    };

    if (currentlySelected > 0) {
      showSuccess(`Auto-selected ${newWorkerIds.length} more worker(s) using ${filterLabels[filter]} (Total: ${currentlySelected + newWorkerIds.length}/${maxWorkers})`);
    } else {
      showSuccess(`Auto-selected ${newWorkerIds.length} worker(s) - ${filterLabels[filter]}`);
    }
  };

  const toggleWorkerSelection = (workerId: number) => {
    // Save scroll position before state change
    const scrollTop = workerListRef.current?.scrollTop || 0;

    setSelectedWorkerIds(prev => {
      const isCurrentlySelected = prev.includes(workerId);

      // If deselecting, always allow
      if (isCurrentlySelected) {
        // Preserve scroll position for manual selection
        setShouldPreserveScroll(true);
        requestAnimationFrame(() => {
          if (workerListRef.current) {
            workerListRef.current.scrollTop = scrollTop;
          }
          setShouldPreserveScroll(false);
        });
        return prev.filter(id => id !== workerId);
      }

      // If selecting, check if we've reached the limit
      const maxWorkers = selectedRequisition?.total_workers_count || selectedRequisition?.workers_count || 0;
      if (selectedRequisition && prev.length >= maxWorkers) {
        showError(`Cannot select more than ${maxWorkers} workers for this requisition`);
        return prev;
      }

      // Preserve scroll position for manual selection
      setShouldPreserveScroll(true);
      requestAnimationFrame(() => {
        if (workerListRef.current) {
          workerListRef.current.scrollTop = scrollTop;
        }
        setShouldPreserveScroll(false);
      });

      // Add to selection
      return [...prev, workerId];
    });
  };

  // Show confirmation modal before assigning
  const handleShowConfirmation = () => {
    if (!selectedRequisition || selectedWorkerIds.length === 0) {
      showError('Please select at least one worker');
      return;
    }

    // Check if exact number of workers is selected
    const requiredWorkers = selectedRequisition.total_workers_count || selectedRequisition.workers_count;
    if (selectedWorkerIds.length !== requiredWorkers) {
      showError(`Please select exactly ${requiredWorkers} workers (currently selected: ${selectedWorkerIds.length})`);
      return;
    }

    setShowConfirmModal(true);
  };

  // Memoized selected workers info for confirmation modal
  const selectedWorkersInfo = useMemo(() => {
    return availableWorkers.filter(w => selectedWorkerIds.includes(w.worker_id));
  }, [availableWorkers, selectedWorkerIds]);

  const handleAssign = async () => {
    if (!selectedRequisition || selectedWorkerIds.length === 0) {
      showError('Please select at least one worker');
      return;
    }

    setAssigning(true);
    try {
      const result = await labourService.assignWorkersToRequisition(
        selectedRequisition.requisition_id,
        selectedWorkerIds
      );
      if (result.success) {
        showSuccess(result.message || 'Workers assigned successfully');
        setShowConfirmModal(false);
        setShowAssignModal(false);
        setSelectedRequisition(null);
        setSelectedWorkerIds([]);
        fetchRequisitions();
      } else {
        showError(result.message || 'Failed to assign workers');
      }
    } catch {
      showError('An unexpected error occurred');
    } finally {
      setAssigning(false);
    }
  };

  const handleViewDetails = (req: LabourRequisition) => {
    setDetailsRequisition(req);
    setShowDetailsModal(true);
  };

  const getStatusBadge = (req: LabourRequisition) => {
    if (req.assignment_status === 'assigned') {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 flex items-center gap-1">
          <UserGroupIcon className="w-3 h-3" /> Assigned
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 flex items-center gap-1">
        <CheckCircleIcon className="w-3 h-3" /> Approved - Pending Assignment
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Worker Assignments</h1>
        <p className="text-gray-600">Assign workers to approved labour requisitions</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-all whitespace-nowrap ${
                isActive
                  ? `${tab.bgColor} ${tab.color} border-b-2 ${tab.borderColor}`
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Requisitions List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      ) : requisitions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <ClipboardDocumentListIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            {activeTab === 'pending' ? 'All caught up!' : 'No assigned requisitions'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {activeTab === 'pending'
              ? 'No requisitions pending assignment.'
              : 'No requisitions have been assigned yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginatedRequisitions.map((req) => (
            <motion.div
              key={req.requisition_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-lg border border-gray-200 px-6 py-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="font-semibold text-gray-900 text-sm">{req.requisition_code}</span>
                  {getStatusBadge(req)}
                  <span className="text-xs text-gray-400 hidden sm:inline">|</span>
                  {/* Display actual skills from labour_items */}
                  {req.labour_items && req.labour_items.length > 0 ? (
                    <div className="flex items-center gap-1 flex-wrap">
                      {Array.from(new Set(req.labour_items.map((item: any) => item.skill_required))).map((skill: string, idx: number) => (
                        <span key={idx} className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700 font-medium">
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700 font-medium">{req.skill_required}</span>
                  )}
                  <span className="text-xs text-gray-600"><UsersIcon className="w-3 h-3 inline mr-0.5" />{req.total_workers_count || req.workers_count}</span>
                  <span className="text-xs text-gray-500 hidden md:inline">
                    <CalendarIcon className="w-3 h-3 inline mr-0.5" />
                    {new Date(req.required_date).toLocaleDateString()}
                  </span>
                  <span className="text-xs text-gray-400 truncate hidden lg:inline">{req.project_name || `#${req.project_id}`}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleViewDetails(req)}
                    className="flex items-center justify-center gap-1 px-2 py-1 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
                  >
                    <EyeIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">View</span>
                  </button>
                  {activeTab === 'assigned' && (
                    <button
                      onClick={async () => {
                        try {
                          await labourService.downloadAssignmentPDF(req.requisition_id);
                          showSuccess('PDF downloaded successfully');
                        } catch (error) {
                          showError('Failed to download PDF');
                        }
                      }}
                      className="flex items-center justify-center gap-1 px-2 py-1 text-xs border border-green-600 text-green-600 rounded hover:bg-green-50 transition-colors"
                      title="Download PDF Report"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="hidden sm:inline">PDF</span>
                    </button>
                  )}
                  {activeTab === 'pending' && (
                    <button
                      onClick={() => openAssignModal(req)}
                      className="flex items-center justify-center gap-1 px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                    >
                      <UserPlusIcon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Assign</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {/* Pagination */}
          {requisitions.length > 0 && (
            <div className="mt-4 px-4 py-3 bg-white rounded-lg border border-gray-200 flex items-center justify-between text-sm">
              <span className="text-gray-600">
                Showing {((currentPage - 1) * PAGINATION.DEFAULT_PAGE_SIZE) + 1} - {Math.min(currentPage * PAGINATION.DEFAULT_PAGE_SIZE, requisitions.length)} of {requisitions.length} requisitions
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
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
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* View Details Modal */}
      {showDetailsModal && detailsRequisition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{detailsRequisition.requisition_code}</h2>
                <p className="text-sm text-gray-500">Requisition Details</p>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {/* Status Badges Row */}
              <div className="flex flex-wrap items-center gap-2 mb-6 pb-4 border-b border-gray-100">
                <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-800">Approved</span>
                {detailsRequisition.assignment_status === 'assigned' ? (
                  <span className="px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800">
                    Pending Assignment
                  </span>
                ) : null}
              </div>

              {/* Labour Items Section */}
              {detailsRequisition.labour_items && detailsRequisition.labour_items.length > 0 ? (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Labour Items ({detailsRequisition.labour_items.length} {detailsRequisition.labour_items.length === 1 ? 'item' : 'items'})</h3>
                  <div className="space-y-3">
                    {(() => {
                      // Distribute workers among labour items based on worker count
                      let workerIndex = 0;
                      const allWorkers = detailsRequisition.assigned_workers || [];

                      return detailsRequisition.labour_items.map((item: any, index: number) => {
                        // Get the exact number of workers for this labour item
                        const workersForThisItem = allWorkers.slice(workerIndex, workerIndex + item.workers_count);
                        workerIndex += item.workers_count;

                        return (
                        <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="text-sm font-medium text-gray-900">{item.work_description || item.item_name || `Item ${index + 1}`}</h4>
                            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 font-medium flex items-center gap-1">
                              <UsersIcon className="w-3 h-3" />
                              {item.workers_count} worker{item.workers_count !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 mb-3">
                            <p className="flex items-center gap-1.5">
                              <WrenchScrewdriverIcon className="w-4 h-4 text-gray-400" />
                              <span className="font-medium">Skill:</span> {item.skill_required || item.skill_lab01}
                            </p>
                          </div>

                          {/* Show assigned workers for this labour item */}
                          {detailsRequisition.assignment_status === 'assigned' && workersForThisItem.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Assigned Workers ({workersForThisItem.length})</p>
                              <div className="space-y-2">
                                {workersForThisItem.map((worker: any) => (
                                  <div key={worker.worker_id} className="bg-green-50 rounded-lg p-2 border border-green-200">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <UserIcon className="w-3.5 h-3.5 text-green-600" />
                                        <span className="text-sm font-medium text-gray-900">{worker.full_name}</span>
                                      </div>
                                      <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700 font-medium">
                                        {worker.worker_code}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              ) : (
                /* Fallback to old single-item format */
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Labour Details</h3>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-medium text-gray-900">{detailsRequisition.work_description}</h4>
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 font-medium flex items-center gap-1">
                        <UsersIcon className="w-3 h-3" />
                        {detailsRequisition.workers_count} worker{detailsRequisition.workers_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <p className="flex items-center gap-1.5">
                        <WrenchScrewdriverIcon className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">Skill:</span> {detailsRequisition.skill_required}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Project & Site Info */}
              <div className="space-y-4 mb-6">
                <div>
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Project</h3>
                  <p className="text-sm text-gray-900 font-medium">{detailsRequisition.project_name || `#${detailsRequisition.project_id}`}</p>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Site/Location</h3>
                  <p className="text-sm text-gray-900">{detailsRequisition.site_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Total Workers</h3>
                    <p className="text-sm text-gray-900 font-semibold">{detailsRequisition.total_workers_count || detailsRequisition.workers_count} worker{(detailsRequisition.total_workers_count || detailsRequisition.workers_count) !== 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Required Date</h3>
                    <p className="text-sm text-gray-900">
                      {new Date(detailsRequisition.required_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Work Shift</h3>
                    <p className="text-sm text-gray-900">
                      {detailsRequisition.start_time && detailsRequisition.end_time ? (
                        <span className="text-blue-600 font-medium">
                          {formatTimeTo12Hour(detailsRequisition.start_time)} - {formatTimeTo12Hour(detailsRequisition.end_time)}
                        </span>
                      ) : detailsRequisition.start_time ? (
                        <span className="text-blue-600 font-medium">
                          From {formatTimeTo12Hour(detailsRequisition.start_time)}
                        </span>
                      ) : detailsRequisition.end_time ? (
                        <span className="text-blue-600 font-medium">
                          Until {formatTimeTo12Hour(detailsRequisition.end_time)}
                        </span>
                      ) : (
                        <span className="text-gray-500 text-xs">Not specified</span>
                      )}
                    </p>
                  </div>
                </div>
                {(detailsRequisition.preferred_workers && detailsRequisition.preferred_workers.length > 0) && (
                  <div className="mt-3">
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Preferred Workers</h3>
                    <div className="flex flex-wrap gap-2">
                      {detailsRequisition.preferred_workers.map((worker: any) => (
                        <div key={worker.worker_id} className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-sm font-medium border border-purple-200">
                          {worker.full_name} ({worker.worker_code})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detailsRequisition.preferred_workers_notes && (
                  <div className="mt-3">
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Preferred Workers (Additional Notes)</h3>
                    <p className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 p-2 rounded border border-gray-200">
                      {detailsRequisition.preferred_workers_notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Request Info */}
              <div className="border-t border-gray-200 pt-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Request Date</h3>
                    <p className="text-sm text-gray-900">{new Date(detailsRequisition.request_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Requested By</h3>
                    <p className="text-sm text-gray-900">{detailsRequisition.requested_by_name}</p>
                  </div>
                </div>
                {detailsRequisition.approved_by_name && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Approved By</h3>
                      <p className="text-sm text-gray-900">{detailsRequisition.approved_by_name}</p>
                      {detailsRequisition.approval_date && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(detailsRequisition.approval_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    {detailsRequisition.assignment_status === 'assigned' && detailsRequisition.assigned_by_name && (
                      <div>
                        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Assigned By</h3>
                        <p className="text-sm text-gray-900">{detailsRequisition.assigned_by_name}</p>
                        {detailsRequisition.assignment_date && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {new Date(detailsRequisition.assignment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex gap-3 p-4 border-t border-gray-200 sticky bottom-0 bg-white">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
              >
                Close
              </button>
              {detailsRequisition.assignment_status === 'assigned' ? (
                <button
                  onClick={async () => {
                    try {
                      await labourService.downloadAssignmentPDF(detailsRequisition.requisition_id);
                      showSuccess('PDF downloaded successfully');
                    } catch (error) {
                      showError('Failed to download PDF');
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF Report
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    openAssignModal(detailsRequisition);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Assign Workers
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && selectedRequisition && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-semibold">Assign Workers</h2>
                <p className="text-sm text-gray-500">
                  {selectedRequisition.requisition_code} - {selectedRequisition.labour_items && selectedRequisition.labour_items.length > 0 ? (
                    <>
                      {Array.from(new Set(selectedRequisition.labour_items.map((item: any) => item.skill_required))).join(', ')} x {selectedRequisition.total_workers_count || selectedRequisition.workers_count}
                    </>
                  ) : (
                    <>{selectedRequisition.skill_required} x {selectedRequisition.workers_count}</>
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <p className="text-sm text-gray-600 mb-3">
                Select {selectedRequisition.total_workers_count || selectedRequisition.workers_count} worker(s) with {selectedRequisition.labour_items && selectedRequisition.labour_items.length > 0 ? (
                  <>
                    {Array.from(new Set(selectedRequisition.labour_items.map((item: any) => item.skill_required))).map((skill, idx, arr) => (
                      <span key={idx}>
                        <span className="font-medium text-purple-600">{skill}</span>
                        {idx < arr.length - 1 ? ', ' : ''}
                      </span>
                    ))} skill{Array.from(new Set(selectedRequisition.labour_items.map((item: any) => item.skill_required))).length > 1 ? 's' : ''}
                  </>
                ) : (
                  <><span className="font-medium text-purple-600">{selectedRequisition.skill_required}</span> skill</>
                )}
              </p>

              {/* Preferred Workers Section */}
              {selectedRequisition.preferred_workers && selectedRequisition.preferred_workers.length > 0 && (
                <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                    <h3 className="text-sm font-semibold text-purple-900">
                      Preferred Workers Requested
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedRequisition.preferred_workers.map((worker: any) => {
                      const isSelected = selectedWorkerIds.includes(worker.worker_id);
                      return (
                        <div
                          key={worker.worker_id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border-2 ${
                            isSelected
                              ? 'bg-green-100 border-green-500 text-green-900'
                              : 'bg-white border-purple-300 text-purple-900'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                          <span className="font-medium">{worker.full_name}</span>
                          <span className={isSelected ? 'text-green-700' : 'text-purple-600'}>({worker.worker_code})</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-purple-700">
                    💡 These workers were requested by the {selectedRequisition.requester_role === 'PM' ? 'Project Manager' : 'Site Engineer'}
                    {selectedWorkerIds.some((id: number) => selectedRequisition.preferred_worker_ids?.includes(id)) && (
                      <span className="ml-1 text-green-700 font-medium">• Auto-selected ✓</span>
                    )}
                  </p>
                </div>
              )}

              {/* Auto-Select Dropdown */}
              {!loadingWorkers && availableWorkers.length > 0 && (() => {
                const maxWorkers = selectedRequisition?.total_workers_count || selectedRequisition?.workers_count || 0;
                const remainingSlots = maxWorkers - selectedWorkerIds.length;
                const allSlotsFilled = remainingSlots <= 0;

                return (
                  <div className="mb-4 flex items-center justify-between gap-3">
                    {!allSlotsFilled && (
                      <div className="relative flex-1">
                        <button
                          onClick={() => setShowQuickSelectDropdown(!showQuickSelectDropdown)}
                          onBlur={() => setTimeout(() => setShowQuickSelectDropdown(false), 200)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                        >
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="text-gray-700 font-medium">
                          {selectedFilter ? (
                            {
                              'low-rate': 'Low Rate',
                              'high-rate': 'High Rate',
                              'single-skill': 'Single Skill',
                              'multi-skill': 'Multi Skill'
                            }[selectedFilter]
                          ) : 'Quick Select'}
                        </span>
                      </div>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${showQuickSelectDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Dropdown Menu */}
                    {showQuickSelectDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                        <button
                          onClick={() => {
                            handleAutoSelect('low-rate');
                            setShowQuickSelectDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-green-50 text-left transition-colors border-b border-gray-100"
                        >
                          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">Low Rate</p>
                            <p className="text-xs text-gray-500">Select cheapest workers</p>
                          </div>
                        </button>

                        <button
                          onClick={() => {
                            handleAutoSelect('high-rate');
                            setShowQuickSelectDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors border-b border-gray-100"
                        >
                          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">High Rate</p>
                            <p className="text-xs text-gray-500">Select premium workers</p>
                          </div>
                        </button>

                        <button
                          onClick={() => {
                            handleAutoSelect('single-skill');
                            setShowQuickSelectDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-orange-50 text-left transition-colors border-b border-gray-100"
                        >
                          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-orange-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">Single Skill</p>
                            <p className="text-xs text-gray-500">Workers with one skill</p>
                          </div>
                        </button>

                        <button
                          onClick={() => {
                            handleAutoSelect('multi-skill');
                            setShowQuickSelectDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-purple-50 text-left transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">Multi Skill</p>
                            <p className="text-xs text-gray-500">Versatile workers</p>
                          </div>
                        </button>
                      </div>
                    )}
                      </div>
                    )}

                    {/* Clear All Button */}
                    {selectedWorkerIds.length > 0 && (
                      <button
                        onClick={() => {
                          // Keep preferred workers, clear only manually selected ones
                          const preferredWorkerIds = selectedRequisition?.preferred_worker_ids || [];
                          const remainingWorkers = selectedWorkerIds.filter(id => preferredWorkerIds.includes(id));
                          setSelectedWorkerIds(remainingWorkers);
                          setSelectedFilter(null); // Reset filter when clearing

                          if (remainingWorkers.length > 0) {
                            showSuccess(`Cleared selections (kept ${remainingWorkers.length} preferred worker(s))`);
                          }
                        }}
                        className="px-3 py-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors font-medium whitespace-nowrap"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                );
              })()}

              {loadingWorkers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                </div>
              ) : (
                <>
                  {/* Worker List */}
                  {availableWorkers.length > 0 && (
                    <div ref={workerListRef} className="space-y-2 max-h-60 overflow-y-auto mb-4">
                      {availableWorkers
                        .sort((a, b) => {
                          // Selected workers first
                          const aSelected = selectedWorkerIds.includes(a.worker_id);
                          const bSelected = selectedWorkerIds.includes(b.worker_id);
                          if (aSelected && !bSelected) return -1;
                          if (!aSelected && bSelected) return 1;
                          return 0;
                        })
                        .map((worker) => {
                        const isAlreadyAssigned = worker.is_assigned || false;
                        const isSelected = selectedWorkerIds.includes(worker.worker_id);
                        const maxWorkers = selectedRequisition?.total_workers_count || selectedRequisition?.workers_count || 0;
                        const limitReached = selectedRequisition && selectedWorkerIds.length >= maxWorkers && !isSelected;
                        const canSelect = !isAlreadyAssigned && !limitReached;

                        return (
                          <div
                            key={worker.worker_id}
                            onClick={() => {
                              if (isAlreadyAssigned) {
                                const availableDate = worker.assignment?.available_from
                                  ? ` Available from ${new Date(worker.assignment.available_from).toLocaleDateString()}`
                                  : '';
                                showError(`This worker is already assigned to another project.${availableDate}`);
                              } else {
                                toggleWorkerSelection(worker.worker_id);
                              }
                            }}
                            className={`p-3 rounded-lg border transition-colors ${
                              isAlreadyAssigned || limitReached
                                ? 'border-gray-300 bg-gray-50 cursor-not-allowed opacity-60'
                                : isSelected
                                ? 'border-purple-500 bg-purple-50 cursor-pointer'
                                : 'border-gray-200 hover:bg-gray-50 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                {/* Selection Checkbox */}
                                <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                  isSelected
                                    ? 'bg-purple-600 border-purple-600'
                                    : isAlreadyAssigned || limitReached
                                    ? 'bg-gray-200 border-gray-300'
                                    : 'border-gray-300 bg-white'
                                }`}>
                                  {isSelected && (
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>

                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-gray-900">{worker.full_name}</p>
                                    {isSelected && (
                                      <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 font-medium">
                                        Selected
                                      </span>
                                    )}
                                    {isAlreadyAssigned && (
                                      <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 font-medium">
                                        Already Assigned
                                      </span>
                                    )}
                                  </div>
                                <p className="text-sm text-gray-500">{worker.worker_code}</p>
                                {isAlreadyAssigned && worker.assignment?.available_from && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    Available from {new Date(worker.assignment.available_from).toLocaleDateString()}
                                  </p>
                                )}
                                {isAlreadyAssigned && !worker.assignment?.available_from && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    Currently assigned
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-medium">AED {worker.hourly_rate}/hr</p>
                                <div className="flex gap-1 mt-1 flex-wrap justify-end">
                                  {worker.skills?.map((skill, idx) => (
                                    <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                  {/* No Workers Message */}
                  {availableWorkers.length === 0 && !showAddWorkerForm && (
                    <div className="text-center py-6 bg-gray-50 rounded-lg mb-4">
                      <UsersIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-600 text-sm">
                        No available workers with {selectedRequisition.labour_items && selectedRequisition.labour_items.length > 0 ? (
                          <>"{Array.from(new Set(selectedRequisition.labour_items.map((item: any) => item.skill_required))).join('", "')}" skill{Array.from(new Set(selectedRequisition.labour_items.map((item: any) => item.skill_required))).length > 1 ? 's' : ''}</>
                        ) : (
                          <>"{selectedRequisition.skill_required}" skill</>
                        )}
                      </p>
                      <p className="text-gray-400 text-xs mt-1">Add a new worker below to continue</p>
                    </div>
                  )}

                  {/* Add Worker Section */}
                  {!showAddWorkerForm ? (
                    <button
                      onClick={() => setShowAddWorkerForm(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                    >
                      <PlusIcon className="w-4 h-4" />
                      <span className="text-sm font-medium">Add New Worker</span>
                    </button>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-gray-900">Add New Worker</h4>
                        <button
                          onClick={() => setShowAddWorkerForm(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Full Name *</label>
                          <input
                            type="text"
                            value={newWorkerData.full_name}
                            onChange={(e) => setNewWorkerData(prev => ({ ...prev, full_name: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                            placeholder="Enter worker name"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                            <input
                              type="text"
                              value={newWorkerData.phone || ''}
                              onChange={(e) => setNewWorkerData(prev => ({ ...prev, phone: e.target.value }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                              placeholder="Phone number"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Hourly Rate (AED) *</label>
                            <input
                              type="number"
                              value={newWorkerData.hourly_rate || ''}
                              onChange={(e) => setNewWorkerData(prev => ({ ...prev, hourly_rate: parseFloat(e.target.value) || 0 }))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                              placeholder="0.00"
                              min="0"
                              step="0.01"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Skill</label>
                          <div className="space-y-2">
                            {/* Display existing skills with remove option */}
                            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg flex-wrap min-h-[42px]">
                              {newWorkerData.skills && newWorkerData.skills.length > 0 ? (
                                newWorkerData.skills.map((skill, idx) => (
                                  <span key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded font-medium">
                                    {skill}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setNewWorkerData(prev => ({
                                          ...prev,
                                          skills: prev.skills.filter((_, i) => i !== idx)
                                        }));
                                      }}
                                      className="hover:bg-purple-200 rounded-full p-0.5"
                                      title="Remove skill"
                                    >
                                      <XMarkIcon className="w-3 h-3" />
                                    </button>
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-gray-400">No skills added</span>
                              )}
                            </div>
                            {/* Add new skill input with button */}
                            <div className="flex gap-2">
                              <input
                                id="skill-input"
                                type="text"
                                placeholder="Type skill name"
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const input = e.currentTarget;
                                    const skillName = input.value.trim();
                                    if (skillName && !newWorkerData.skills.includes(skillName)) {
                                      setNewWorkerData(prev => ({
                                        ...prev,
                                        skills: [...prev.skills, skillName]
                                      }));
                                      input.value = '';
                                    } else if (newWorkerData.skills.includes(skillName)) {
                                      showError('Skill already added');
                                    } else if (!skillName) {
                                      showError('Please enter a skill name');
                                    }
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const input = document.getElementById('skill-input') as HTMLInputElement;
                                  if (input) {
                                    const skillName = input.value.trim();
                                    if (skillName && !newWorkerData.skills.includes(skillName)) {
                                      setNewWorkerData(prev => ({
                                        ...prev,
                                        skills: [...prev.skills, skillName]
                                      }));
                                      input.value = '';
                                    } else if (newWorkerData.skills.includes(skillName)) {
                                      showError('Skill already added');
                                    } else if (!skillName) {
                                      showError('Please enter a skill name');
                                    }
                                  }
                                }}
                                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors font-medium"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => setShowAddWorkerForm(false)}
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleAddWorker}
                            disabled={addingWorker}
                            className="flex-1 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-1"
                          >
                            {addingWorker ? (
                              <>
                                <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                                Adding...
                              </>
                            ) : (
                              <>
                                <PlusIcon className="w-3 h-3" />
                                Add Worker
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </>
              )}

              {/* Footer */}
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  <p className="flex items-center gap-2">
                    Selected: <span className={`font-medium ${selectedWorkerIds.length === (selectedRequisition.total_workers_count || selectedRequisition.workers_count) ? 'text-green-600' : selectedWorkerIds.length > (selectedRequisition.total_workers_count || selectedRequisition.workers_count) ? 'text-red-600' : 'text-gray-900'}`}>
                      {selectedWorkerIds.length}
                    </span> / {selectedRequisition.total_workers_count || selectedRequisition.workers_count}
                    {selectedWorkerIds.length === (selectedRequisition.total_workers_count || selectedRequisition.workers_count) && (
                      <span className="text-xs text-green-600">✓ Ready</span>
                    )}
                    {selectedWorkerIds.length > (selectedRequisition.total_workers_count || selectedRequisition.workers_count) && (
                      <span className="text-xs text-red-600">Too many!</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {availableWorkers.filter(w => !w.is_assigned).length} available of {availableWorkers.length} matching workers
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowAssignModal(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleShowConfirmation}
                    disabled={selectedWorkerIds.length === 0 || selectedWorkerIds.length !== (selectedRequisition.total_workers_count || selectedRequisition.workers_count) || assigning}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Assign Selected
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirmation Modal - WhatsApp Notification Alert */}
      {showConfirmModal && selectedRequisition && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl w-full max-w-md"
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <WhatsAppIcon className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 id="confirm-modal-title" className="text-lg font-semibold text-gray-900">Confirm Assignment</h2>
                <p className="text-sm text-gray-500">WhatsApp notifications will be sent</p>
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              {/* Alert Box */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <div className="flex items-start gap-2">
                  <WhatsAppIcon className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-green-800">
                    <p className="font-medium">WhatsApp messages will be sent automatically</p>
                    <p className="mt-1">Each worker will receive their assignment details via WhatsApp.</p>
                  </div>
                </div>
              </div>

              {/* Assignment Summary */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Requisition:</span>
                  <span className="font-medium text-gray-900">{selectedRequisition.requisition_code}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Site:</span>
                  <span className="font-medium text-gray-900">{selectedRequisition.site_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Workers to Assign:</span>
                  <span className="font-medium text-gray-900">{selectedWorkerIds.length}</span>
                </div>
              </div>

              {/* Workers List */}
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Workers to be notified:</p>
                <div className="max-h-32 overflow-y-auto space-y-2">
                  {selectedWorkersInfo.map(worker => (
                    <div key={worker.worker_id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center">
                          <UserIcon className="w-4 h-4 text-purple-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{worker.full_name}</span>
                      </div>
                      {worker.phone ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                          WhatsApp
                        </span>
                      ) : (
                        <span className="text-xs text-red-500">No phone</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={assigning}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssign}
                  disabled={assigning}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  {assigning ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Assigning...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-4 h-4" />
                      Confirm & Send
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default WorkerAssignments;
