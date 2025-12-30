import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  TrashIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import { apiClient } from '@/api/config';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { useAuthStore } from '@/store/authStore';

interface Project {
  project_id: number;
  project_name: string;
  status?: string;
  areas: Area[];
}

interface Area {
  area_id: number;
  area_name: string;
  boqs: BOQ[];
}

interface BOQ {
  boq_id: number;
  boq_name: string;
}

interface Preliminary {
  prelim_id: number;
  name: string;
  description: string;
  unit: string;
  rate: number;
  allocated_amount: number;
  allocated_quantity: number;
  display_order?: number;
}

interface PreliminaryItem {
  id: string;
  prelim_id: number;
  name: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;  // Editable amount
  allocated_amount: number;  // Original allocated amount from BOQ
  justification: string;
}

interface PreliminaryPurchaseFormProps {
  onClose?: () => void;
  onSuccess?: () => void;
}

const PreliminaryPurchaseForm: React.FC<PreliminaryPurchaseFormProps> = ({ onClose, onSuccess }) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [availablePreliminaries, setAvailablePreliminaries] = useState<Preliminary[]>([]);

  // Form state
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [selectedBoq, setSelectedBoq] = useState<BOQ | null>(null);
  const [preliminaryItems, setPreliminaryItems] = useState<PreliminaryItem[]>([]);
  const [remarks, setRemarks] = useState('');

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  // Fetch available preliminaries when BOQ is selected
  useEffect(() => {
    if (selectedBoq) {
      fetchPreliminaries(selectedBoq.boq_id);
    } else {
      setAvailablePreliminaries([]);
      setPreliminaryItems([]);
    }
  }, [selectedBoq]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/projects/assigned-to-me');
      const projectsList = response.data.projects || [];
      setProjects(projectsList);

      if (projectsList.length === 0) {
        showInfo('No projects assigned to you yet');
      }
    } catch (error: any) {
      console.error('Error fetching projects:', error);
      showError('Failed to load assigned projects');
    } finally {
      setLoading(false);
    }
  };

  const fetchPreliminaries = async (boqId: number) => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/boq/${boqId}/preliminaries-for-purchase`);

      if (response.data.success) {
        const preliminaries = response.data.data || [];
        setAvailablePreliminaries(preliminaries);

        if (preliminaries.length === 0) {
          showInfo('No preliminaries available for this BOQ. Preliminaries need to be selected during BOQ creation.');
        }
      } else {
        setAvailablePreliminaries([]);
        showWarning('Could not load preliminaries for this BOQ');
      }
    } catch (error: any) {
      console.error('Error fetching preliminaries:', error);
      setAvailablePreliminaries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectChange = (projectId: number) => {
    const project = projects.find(p => p.project_id === projectId);
    setSelectedProject(project || null);
    setSelectedArea(null);
    setSelectedBoq(null);
    setPreliminaryItems([]);

    if (project) {
      // Auto-select Area if only one exists
      if (project.areas && project.areas.length === 1) {
        const singleArea = project.areas[0];
        setSelectedArea(singleArea);

        // Auto-select BOQ if area has only one BOQ
        if (singleArea.boqs && singleArea.boqs.length === 1) {
          const singleBoq = singleArea.boqs[0];
          setSelectedBoq(singleBoq);
        }
      }
    }
  };

  const handleAreaChange = (areaId: number) => {
    if (!selectedProject) return;
    const area = selectedProject.areas.find(a => a.area_id === areaId);
    setSelectedArea(area || null);
    setSelectedBoq(null);
    setPreliminaryItems([]);

    if (area) {
      // Auto-select BOQ if only one exists
      if (area.boqs && area.boqs.length === 1) {
        const singleBoq = area.boqs[0];
        setSelectedBoq(singleBoq);
      }
    }
  };

  const handleBoqChange = (boqId: number) => {
    if (!selectedArea) return;
    const boq = selectedArea.boqs.find(b => b.boq_id === boqId);
    setSelectedBoq(boq || null);
    setPreliminaryItems([]);
  };

  const addPreliminaryItem = (preliminary: Preliminary) => {
    // Check if already added
    if (preliminaryItems.some(p => p.prelim_id === preliminary.prelim_id)) {
      showWarning('This preliminary item is already added');
      return;
    }

    const newItem: PreliminaryItem = {
      id: `prelim_${Date.now()}_${preliminary.prelim_id}`,
      prelim_id: preliminary.prelim_id,
      name: preliminary.name,
      description: preliminary.description,
      unit: preliminary.unit,
      quantity: preliminary.allocated_quantity || 1,
      rate: preliminary.rate,
      amount: preliminary.allocated_amount || preliminary.rate,  // Use allocated amount or rate as default
      allocated_amount: preliminary.allocated_amount || 0,
      justification: '',
    };

    setPreliminaryItems([...preliminaryItems, newItem]);
  };

  const updatePreliminaryItem = (id: string, updates: Partial<PreliminaryItem>) => {
    setPreliminaryItems(items =>
      items.map(item => {
        if (item.id === id) {
          const updated = { ...item, ...updates };
          return updated;
        }
        return item;
      })
    );
  };

  const removePreliminaryItem = (id: string) => {
    setPreliminaryItems(items => items.filter(item => item.id !== id));
  };

  // Calculate total amount
  const totalAmount = useMemo(() => {
    return preliminaryItems.reduce((sum, item) => sum + item.amount, 0);
  }, [preliminaryItems]);

  const validateForm = (): boolean => {
    if (!selectedProject || !selectedArea || !selectedBoq) {
      showError('Please select project, area, and BOQ');
      return false;
    }

    if (preliminaryItems.length === 0) {
      showError('Please add at least one preliminary item');
      return false;
    }

    for (const item of preliminaryItems) {
      if (item.amount <= 0) {
        showError(`Amount must be greater than 0 for "${item.name}"`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    if (!validateForm()) return;

    setIsSubmitting(true);
    setLoading(true);

    try {
      const payload = {
        boq_id: selectedBoq!.boq_id,
        project_id: selectedProject!.project_id,
        preliminaries: preliminaryItems.map(item => ({
          prelim_id: item.prelim_id,
          name: item.name,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,  // Purchase amount (editable)
          allocated_amount: item.allocated_amount,  // Original BOQ allocated amount
          justification: item.justification,
        })),
        remarks: remarks,
      };

      const response = await apiClient.post('/preliminary-purchases', payload);

      if (response.data.success) {
        showSuccess('Preliminary purchase request created successfully');
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      } else {
        showError(response.data.error || 'Failed to create preliminary purchase request');
      }
    } catch (error: any) {
      console.error('Error creating preliminary purchase:', error);
      showError(error.response?.data?.error || 'Failed to create preliminary purchase request');
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <InformationCircleIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Preliminary Purchase Request</p>
            <p className="mt-1 text-blue-700">
              Purchase preliminaries that were selected during BOQ creation.
              Request will be created in pending status and can be sent to buyer later.
            </p>
          </div>
        </div>
      </div>

      {/* Project Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Project <span className="text-red-500">*</span>
        </label>
        <select
          value={selectedProject?.project_id || ''}
          onChange={(e) => handleProjectChange(parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
          disabled={loading}
          required
        >
          <option value="">Select Project</option>
          {projects.map(project => (
            <option key={project.project_id} value={project.project_id}>
              {project.project_name}
            </option>
          ))}
        </select>
      </div>

      {/* Area Selection */}
      {selectedProject && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Area <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedArea?.area_id || ''}
            onChange={(e) => handleAreaChange(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
            required
          >
            <option value="">Select Area</option>
            {selectedProject.areas?.map(area => (
              <option key={area.area_id} value={area.area_id}>
                {area.area_name}
              </option>
            ))}
          </select>
        </motion.div>
      )}

      {/* BOQ Selection */}
      {selectedArea && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-1">
            BOQ <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedBoq?.boq_id || ''}
            onChange={(e) => handleBoqChange(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
            required
          >
            <option value="">Select BOQ</option>
            {selectedArea.boqs.map(boq => (
              <option key={boq.boq_id} value={boq.boq_id}>
                {boq.boq_name}
              </option>
            ))}
          </select>
        </motion.div>
      )}

      {/* Available Preliminaries */}
      {selectedBoq && availablePreliminaries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Available Preliminaries
            <span className="text-xs text-gray-500 font-normal ml-2">Click to add</span>
          </label>
          <div className="border border-gray-300 rounded-lg p-3 bg-gray-50 max-h-48 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availablePreliminaries.map(prelim => {
                const isAdded = preliminaryItems.some(p => p.prelim_id === prelim.prelim_id);
                return (
                  <button
                    type="button"
                    key={prelim.prelim_id}
                    onClick={() => addPreliminaryItem(prelim)}
                    disabled={isAdded}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      isAdded
                        ? 'bg-green-50 border-green-300 cursor-not-allowed'
                        : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-gray-900 flex-1 pr-2">{prelim.name}</span>
                      {isAdded ? (
                        <span className="text-xs text-green-600 font-medium">Added</span>
                      ) : (
                        <PlusIcon className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">{prelim.description}</p>
                    {/* Allocated Amount - Prominent Display */}
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Allocated Amount:</span>
                        <span className="text-sm font-bold text-[#243d8a]">
                          AED {(prelim.allocated_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      {prelim.rate > 0 && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-gray-400">Rate per {prelim.unit}:</span>
                          <span className="text-xs text-gray-600">
                            AED {prelim.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* No preliminaries message */}
      {selectedBoq && availablePreliminaries.length === 0 && !loading && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <InformationCircleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">No Preliminaries Available</p>
              <p className="mt-1 text-yellow-700">
                No preliminaries were selected for this BOQ during creation.
                Please contact the Estimator to add preliminaries to the BOQ.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Selected Preliminary Items */}
      {preliminaryItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-gray-900">Selected Preliminaries</h3>
            <span className="text-sm text-gray-500">{preliminaryItems.length} item(s)</span>
          </div>

          <div className="space-y-3">
            <AnimatePresence>
              {preliminaryItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-white border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{item.name}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePreliminaryItem(item.id)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded ml-2"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Allocated Amount Display */}
                  <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-blue-700">BOQ Allocated Amount:</span>
                      <span className="text-sm font-bold text-blue-800">
                        AED {(item.allocated_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Purchase Amount - Editable */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Purchase Amount (AED) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amount}
                      onChange={(e) => updatePreliminaryItem(item.id, { amount: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                    />
                    {item.amount > item.allocated_amount && item.allocated_amount > 0 && (
                      <p className="text-xs text-orange-600 mt-1">
                        Exceeds allocated amount by AED {(item.amount - item.allocated_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>

                  {/* Justification */}
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Justification (Optional)</label>
                    <input
                      type="text"
                      value={item.justification}
                      onChange={(e) => updatePreliminaryItem(item.id, { justification: e.target.value })}
                      placeholder="Why is this preliminary needed?"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Grand Total */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="flex justify-between items-center">
              <span className="font-medium text-gray-900">Grand Total</span>
              <span className="text-xl font-bold text-[#243d8a]">
                AED {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Remarks */}
      {preliminaryItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Remarks (Optional)
          </label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#243d8a] focus:border-[#243d8a]"
            placeholder="Additional notes or comments..."
          />
        </motion.div>
      )}

      {/* Submit Buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || preliminaryItems.length === 0}
          className="px-6 py-2 bg-[#243d8a] text-white rounded-lg hover:bg-[#1a2d6d] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <ModernLoadingSpinners size="xs" />
              Creating...
            </>
          ) : (
            'Create Request'
          )}
        </button>
      </div>
    </form>
  );
};

export default React.memo(PreliminaryPurchaseForm);
