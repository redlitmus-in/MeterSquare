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
  PlusIcon
} from '@heroicons/react/24/outline';

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
  const [detailsRequisition, setDetailsRequisition] = useState<LabourRequisition | null>(null);

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

  const openAssignModal = async (requisition: LabourRequisition) => {
    setSelectedRequisition(requisition);
    setSelectedWorkerIds([]);
    setShowAssignModal(true);
    setLoadingWorkers(true);
    setShowAddWorkerForm(false);
    setNewWorkerData({
      full_name: '',
      phone: '',
      hourly_rate: 0,
      skills: [requisition.skill_required]
    });

    const result = await labourService.getAvailableWorkers(
      requisition.skill_required,
      requisition.required_date
    );
    if (result.success) {
      setAvailableWorkers(result.data);
    } else {
      showError(result.message || 'Failed to fetch available workers');
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

  const toggleWorkerSelection = (workerId: number) => {
    setSelectedWorkerIds(prev => {
      const isCurrentlySelected = prev.includes(workerId);

      // If deselecting, always allow
      if (isCurrentlySelected) {
        return prev.filter(id => id !== workerId);
      }

      // If selecting, check if we've reached the limit
      if (selectedRequisition && prev.length >= selectedRequisition.workers_count) {
        showError(`Cannot select more than ${selectedRequisition.workers_count} workers for this requisition`);
        return prev;
      }

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
    if (selectedWorkerIds.length !== selectedRequisition.workers_count) {
      showError(`Please select exactly ${selectedRequisition.workers_count} workers (currently selected: ${selectedWorkerIds.length})`);
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
          {requisitions.map((req) => (
            <motion.div
              key={req.requisition_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-lg border border-gray-200 px-6 py-6 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="font-semibold text-gray-900 text-sm">{req.requisition_code}</span>
                  {getStatusBadge(req)}
                  <span className="text-xs text-gray-400 hidden sm:inline">|</span>
                  <span className="px-2 py-0.5 text-xs rounded bg-purple-100 text-purple-700 font-medium">{req.skill_required}</span>
                  <span className="text-xs text-gray-600"><UsersIcon className="w-3 h-3 inline mr-0.5" />{req.workers_count}</span>
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
              {/* Status Row */}
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100">
                <span className="text-sm text-gray-500">Status:</span>
                <span className="px-2.5 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">Approved</span>
                {detailsRequisition.assignment_status === 'assigned' && (
                  <span className="px-2.5 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                    Workers Assigned
                  </span>
                )}
              </div>

              {/* Details Grid */}
              <div className="space-y-4">
                <div className="border-b border-gray-100 pb-4">
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Work Description</h3>
                  <p className="text-gray-900">{detailsRequisition.work_description}</p>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Project</h3>
                    <p className="text-gray-900">{detailsRequisition.project_name || `#${detailsRequisition.project_id}`}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Site</h3>
                    <p className="text-gray-900">{detailsRequisition.site_name}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Skill Required</h3>
                    <p className="text-gray-900 font-medium">{detailsRequisition.skill_required}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Workers Count</h3>
                    <p className="text-gray-900 font-medium">{detailsRequisition.workers_count}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Required Date</h3>
                    <p className="text-gray-900">{new Date(detailsRequisition.required_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Request Date</h3>
                    <p className="text-gray-900">{new Date(detailsRequisition.request_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Requested By</h3>
                    <p className="text-gray-900">{detailsRequisition.requested_by_name}</p>
                  </div>
                  {detailsRequisition.approved_by_name && (
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Approved By</h3>
                      <p className="text-gray-900">{detailsRequisition.approved_by_name}</p>
                      {detailsRequisition.approval_date && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(detailsRequisition.approval_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                  {detailsRequisition.assignment_status === 'assigned' && detailsRequisition.assigned_by_name && (
                    <div>
                      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Assigned By</h3>
                      <p className="text-gray-900">{detailsRequisition.assigned_by_name}</p>
                      {detailsRequisition.assignment_date && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {new Date(detailsRequisition.assignment_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
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
              {detailsRequisition.assignment_status !== 'assigned' && (
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
                  {selectedRequisition.requisition_code} - {selectedRequisition.skill_required} x {selectedRequisition.workers_count}
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
              <p className="text-sm text-gray-600 mb-4">
                Select {selectedRequisition.workers_count} worker(s) with <span className="font-medium text-purple-600">{selectedRequisition.skill_required}</span> skill
              </p>

              {loadingWorkers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                </div>
              ) : (
                <>
                  {/* Worker List */}
                  {availableWorkers.length > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                      {availableWorkers.map((worker) => {
                        const isAlreadyAssigned = worker.is_assigned || false;
                        const isSelected = selectedWorkerIds.includes(worker.worker_id);
                        const limitReached = selectedRequisition && selectedWorkerIds.length >= selectedRequisition.workers_count && !isSelected;
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
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-gray-900">{worker.full_name}</p>
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
                        );
                      })}
                    </div>
                  )}

                  {/* No Workers Message */}
                  {availableWorkers.length === 0 && !showAddWorkerForm && (
                    <div className="text-center py-6 bg-gray-50 rounded-lg mb-4">
                      <UsersIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-600 text-sm">No available workers with "{selectedRequisition.skill_required}" skill</p>
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
                          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg">
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded font-medium">
                              {selectedRequisition.skill_required}
                            </span>
                            <span className="text-xs text-gray-400">(auto-assigned)</span>
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
                    Selected: <span className={`font-medium ${selectedWorkerIds.length === selectedRequisition.workers_count ? 'text-green-600' : selectedWorkerIds.length > selectedRequisition.workers_count ? 'text-red-600' : 'text-gray-900'}`}>
                      {selectedWorkerIds.length}
                    </span> / {selectedRequisition.workers_count}
                    {selectedWorkerIds.length === selectedRequisition.workers_count && (
                      <span className="text-xs text-green-600">✓ Ready</span>
                    )}
                    {selectedWorkerIds.length > selectedRequisition.workers_count && (
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
                    disabled={selectedWorkerIds.length === 0 || selectedWorkerIds.length !== selectedRequisition.workers_count || assigning}
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
