import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CubeIcon,
  BuildingOfficeIcon,
  WrenchScrewdriverIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
  CheckCircleIcon,
  ClockIcon,
  TruckIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { siteEngineerService } from '../services/siteEngineerService';
import { showError, showSuccess } from '@/utils/toastHelper';
import { apiClient } from '@/api/config';

// Types
interface DispatchedMovement {
  movement_id: number;
  category_id: number;
  category_code: string;
  category_name: string;
  item_id?: number;
  item_code?: string;
  project_id: number;
  project_name: string;
  quantity: number;
  dispatched_at: string;
  dispatched_by: string;
  received_at?: string;
  received_by?: string;
  is_received: boolean;
  condition_before?: string;
  // Pending return request info
  has_pending_return?: boolean;
  pending_return_tracking?: string;
  pending_return_at?: string;
  pending_return_quantity?: number;
}

interface AssetHistory {
  movement_id: number;
  category_name: string;
  category_code: string;
  item_code?: string;
  movement_type: 'DISPATCH' | 'RETURN';
  project_id: number;
  project_name: string;
  quantity: number;
  dispatched_at?: string;
  dispatched_by?: string;
  returned_at?: string;
  returned_by?: string;
  condition_before?: string;
  condition_after?: string;
  notes?: string;
  created_at: string;
}

// Constants for colors
const CONDITION_COLORS: Record<string, string> = {
  good: 'bg-green-100 text-green-700 border-green-200',
  fair: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  poor: 'bg-orange-100 text-orange-700 border-orange-200',
  damaged: 'bg-red-100 text-red-700 border-red-200',
  default: 'bg-gray-100 text-gray-700 border-gray-200'
};

const getConditionColor = (condition: string): string => {
  return CONDITION_COLORS[condition?.toLowerCase()] || CONDITION_COLORS.default;
};

const SiteAssets: React.FC = () => {
  const [movements, setMovements] = useState<DispatchedMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingReceived, setMarkingReceived] = useState<number | null>(null);

  // Return request modal state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnMovement, setReturnMovement] = useState<DispatchedMovement | null>(null);
  const [returnForm, setReturnForm] = useState({
    quantity: 1,
    condition: 'good',
    notes: '',
    damage_description: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<AssetHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const fetchMovements = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/assets/my-dispatched-movements');
      setMovements(response.data.movements || []);
    } catch (err) {
      console.error('Error fetching dispatched movements:', err);
      showError('Failed to load dispatched assets');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      // Get SE's assigned project IDs from movements or fetch assigned projects
      const projectIds: number[] = [...new Set(movements.map(m => m.project_id))];
      const projectNames: Record<number, string> = {};

      // Build project name map from movements
      movements.forEach(m => {
        projectNames[m.project_id] = m.project_name;
      });

      // If no movements, fetch assigned projects
      if (projectIds.length === 0) {
        try {
          const projectsResponse = await apiClient.get('/projects/assigned-to-me');
          const assignedProjects = projectsResponse.data.projects || [];
          assignedProjects.forEach((p: { project_id: number; project_name: string }) => {
            projectIds.push(p.project_id);
            projectNames[p.project_id] = p.project_name;
          });
        } catch (err) {
          console.error('Error fetching assigned projects:', err);
        }
      }

      if (projectIds.length === 0) {
        setHistory([]);
        setLoadingHistory(false);
        return;
      }

      // Fetch movements for all SE's projects
      const allHistory: AssetHistory[] = [];

      for (const projectId of projectIds) {
        try {
          const response = await apiClient.get(`/assets/movements?project_id=${projectId}&limit=50`);
          const projectMovements = response.data.movements || [];

          projectMovements.forEach((m: AssetHistory) => {
            allHistory.push({
              ...m,
              project_name: projectNames[projectId] || m.project_name || `Project #${projectId}`
            });
          });
        } catch (err) {
          console.error(`Error fetching history for project ${projectId}:`, err);
        }
      }

      // Sort by date descending
      allHistory.sort((a, b) => {
        const dateA = new Date(a.dispatched_at || a.returned_at || a.created_at).getTime();
        const dateB = new Date(b.dispatched_at || b.returned_at || b.created_at).getTime();
        return dateB - dateA;
      });

      setHistory(allHistory.slice(0, 50)); // Limit to 50 records
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  const handleMarkReceived = async (movementId: number) => {
    try {
      setMarkingReceived(movementId);
      await apiClient.post('/assets/mark-received', { movement_id: movementId });
      showSuccess('Asset marked as received! PM has been notified.');
      fetchMovements();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to mark as received');
    } finally {
      setMarkingReceived(null);
    }
  };

  const openReturnModal = (movement: DispatchedMovement) => {
    setReturnMovement(movement);
    setReturnForm({
      quantity: movement.quantity,
      condition: 'good',
      notes: '',
      damage_description: ''
    });
    setShowReturnModal(true);
  };

  const handleReturnRequest = async () => {
    if (!returnMovement) return;

    try {
      setSubmitting(true);

      const payload: Record<string, unknown> = {
        category_id: returnMovement.category_id,
        project_id: returnMovement.project_id,
        condition: returnForm.condition,
        quantity: returnForm.quantity,
        notes: returnForm.notes || undefined,
        damage_description: returnForm.condition !== 'good' ? returnForm.damage_description : undefined
      };

      if (returnMovement.item_id) {
        payload.item_ids = [returnMovement.item_id];
      }

      const response = await apiClient.post('/assets/return-requests', payload);

      showSuccess(`Return request created! Tracking: ${response.data.tracking_code}`);
      setShowReturnModal(false);
      setReturnMovement(null);
      fetchMovements();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      showError(error.response?.data?.error || 'Failed to create return request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" />
      </div>
    );
  }

  // Group by status
  const pendingReceipt = movements.filter(m => !m.is_received);
  const received = movements.filter(m => m.is_received);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
                <CubeIcon className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Site Assets</h1>
                <p className="text-sm text-gray-600">Track dispatched assets at your project sites</p>
              </div>
            </div>
            <button
              onClick={fetchMovements}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <TruckIcon className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Pending Receipt</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingReceipt.length}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Received at Site</p>
                <p className="text-2xl font-bold text-green-600">{received.length}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <CubeIcon className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Dispatched</p>
                <p className="text-2xl font-bold text-indigo-600">{movements.length}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Pending Receipt Section - Yellow */}
        {pendingReceipt.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border-2 border-yellow-300 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-yellow-200 bg-yellow-50">
              <h3 className="font-semibold text-yellow-800 flex items-center gap-2">
                <TruckIcon className="w-5 h-5" />
                Dispatched - Pending Your Receipt
              </h3>
              <p className="text-sm text-yellow-600 mt-1">These assets have been dispatched to your sites. Mark as received when you get them.</p>
            </div>
            <div className="divide-y divide-gray-100">
              {pendingReceipt.map((mov) => (
                <div key={mov.movement_id} className="px-5 py-4 hover:bg-yellow-50/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-yellow-100 rounded-lg">
                        <TruckIcon className="w-5 h-5 text-yellow-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{mov.category_name}</p>
                        <p className="text-sm text-gray-500">
                          {mov.quantity} unit(s) • {mov.item_code || mov.category_code}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          <span className="font-medium">Project:</span> {mov.project_name}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Dispatched: {new Date(mov.dispatched_at).toLocaleDateString()} at {new Date(mov.dispatched_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          {mov.dispatched_by && ` by ${mov.dispatched_by}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleMarkReceived(mov.movement_id)}
                      disabled={markingReceived === mov.movement_id}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
                    >
                      {markingReceived === mov.movement_id ? (
                        <>
                          <ArrowPathIcon className="w-4 h-4 animate-spin" />
                          Marking...
                        </>
                      ) : (
                        <>
                          <CheckCircleIcon className="w-4 h-4" />
                          Mark as Received
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Received Section - Green */}
        {received.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border-2 border-green-300 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-green-200 bg-green-50">
              <h3 className="font-semibold text-green-800 flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5" />
                Received at Your Sites
              </h3>
              <p className="text-sm text-green-600 mt-1">These assets are at your sites. You can request to return them when done.</p>
            </div>
            <div className="divide-y divide-gray-100">
              {received.map((mov) => (
                <div key={mov.movement_id} className="px-5 py-4 hover:bg-green-50/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{mov.category_name}</p>
                        <p className="text-sm text-gray-500">
                          {mov.quantity} unit(s) • {mov.item_code || mov.category_code}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          <span className="font-medium">Project:</span> {mov.project_name}
                        </p>
                        <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                          <p>
                            Dispatched: {new Date(mov.dispatched_at).toLocaleDateString()} {new Date(mov.dispatched_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </p>
                          {mov.received_at && (
                            <p className="text-green-600">
                              Received: {new Date(mov.received_at).toLocaleDateString()} {new Date(mov.received_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              {mov.received_by && ` by ${mov.received_by}`}
                            </p>
                          )}
                          {mov.has_pending_return && mov.pending_return_at && (
                            <p className="text-orange-600 font-medium">
                              Return Requested: {new Date(mov.pending_return_at).toLocaleDateString()} {new Date(mov.pending_return_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    {mov.has_pending_return ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg font-medium text-sm">
                          <ClockIcon className="w-4 h-4" />
                          Waiting for PM
                        </span>
                        {mov.pending_return_tracking && (
                          <span className="text-xs text-orange-600 font-mono">{mov.pending_return_tracking}</span>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => openReturnModal(mov)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                      >
                        <ArrowUturnLeftIcon className="w-4 h-4" />
                        Return
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {movements.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center"
          >
            <div className="flex flex-col items-center">
              <div className="p-4 bg-gray-100 rounded-full mb-4">
                <CubeIcon className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Assets at Your Sites</h3>
              <p className="text-gray-500 max-w-md">
                There are currently no assets dispatched to your project sites.
                Assets will appear here when they are dispatched by the Production Manager.
              </p>
            </div>
          </motion.div>
        )}

        {/* Info Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="p-1 bg-blue-100 rounded-full">
              <CubeIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-blue-800 font-medium">Asset Flow</p>
              <p className="text-sm text-blue-600 mt-1">
                <span className="font-medium">1. Dispatched</span> → PM dispatches asset, you see it in yellow section<br/>
                <span className="font-medium">2. Received</span> → Mark as received when you get it, moves to green section<br/>
                <span className="font-medium">3. Return</span> → Request return when done, PM will be notified
              </p>
            </div>
          </div>
        </div>

        {/* History Section - Collapsible */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
        >
          <button
            onClick={() => {
              if (!showHistory) fetchHistory();
              setShowHistory(!showHistory);
            }}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <DocumentTextIcon className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">Asset Movement History</h3>
                <p className="text-sm text-gray-500">View all dispatches and returns for your projects</p>
              </div>
            </div>
            {showHistory ? (
              <ChevronUpIcon className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
            )}
          </button>

          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-gray-200"
              >
                {loadingHistory ? (
                  <div className="p-8 text-center">
                    <ArrowPathIcon className="w-6 h-6 animate-spin text-indigo-600 mx-auto" />
                    <p className="text-sm text-gray-500 mt-2">Loading history...</p>
                  </div>
                ) : history.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <DocumentTextIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No movement history found for your projects</p>
                  </div>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto">
                    {/* Group by project */}
                    {Object.entries(
                      history.reduce((acc, h) => {
                        const key = `${h.project_id}-${h.project_name}`;
                        if (!acc[key]) acc[key] = { project_name: h.project_name, movements: [] };
                        acc[key].movements.push(h);
                        return acc;
                      }, {} as Record<string, { project_name: string; movements: AssetHistory[] }>)
                    ).map(([key, group]) => {
                      const isExpanded = expandedProjects.has(key);
                      return (
                        <div key={key} className="border-b border-gray-200 last:border-b-0">
                          {/* Project Header - Clickable */}
                          <button
                            onClick={() => {
                              const newExpanded = new Set(expandedProjects);
                              if (isExpanded) {
                                newExpanded.delete(key);
                              } else {
                                newExpanded.add(key);
                              }
                              setExpandedProjects(newExpanded);
                            }}
                            className="w-full px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <BuildingOfficeIcon className="w-5 h-5 text-indigo-600" />
                              <h4 className="font-semibold text-gray-900">{group.project_name}</h4>
                              <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                                {group.movements.length} movement(s)
                              </span>
                            </div>
                            {isExpanded ? (
                              <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                          {/* Project Movements - Collapsible */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="divide-y divide-gray-100">
                                  {group.movements.map((h) => (
                                    <div key={h.movement_id} className="px-5 py-3 hover:bg-gray-50">
                                      <div className="flex items-start gap-3">
                                        <div className={`p-1.5 rounded-lg ${h.movement_type === 'DISPATCH' ? 'bg-orange-100' : 'bg-green-100'}`}>
                                          {h.movement_type === 'DISPATCH' ? (
                                            <TruckIcon className="w-4 h-4 text-orange-600" />
                                          ) : (
                                            <ArrowUturnLeftIcon className="w-4 h-4 text-green-600" />
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                              h.movement_type === 'DISPATCH' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                                            }`}>
                                              {h.movement_type === 'DISPATCH' ? 'Dispatched' : 'Returned'}
                                            </span>
                                            <span className="font-medium text-gray-900 text-sm">{h.category_name}</span>
                                            <span className="text-xs text-gray-500">
                                              {h.quantity} unit(s)
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                            <span>
                                              {new Date(h.dispatched_at || h.returned_at || h.created_at).toLocaleDateString('en-IN', {
                                                day: '2-digit', month: 'short', year: 'numeric'
                                              })}
                                              {' '}
                                              {new Date(h.dispatched_at || h.returned_at || h.created_at).toLocaleTimeString('en-IN', {
                                                hour: '2-digit', minute: '2-digit', hour12: true
                                              })}
                                            </span>
                                            <span>•</span>
                                            <span>By: {h.movement_type === 'DISPATCH' ? h.dispatched_by : h.returned_by || '-'}</span>
                                            {h.item_code && (
                                              <>
                                                <span>•</span>
                                                <span>{h.item_code}</span>
                                              </>
                                            )}
                                          </div>
                                          {h.notes && (
                                            <p className="text-xs text-gray-500 mt-1 bg-gray-100 rounded px-2 py-1 inline-block">
                                              {h.notes}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Return Request Modal */}
      <AnimatePresence>
        {showReturnModal && returnMovement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowReturnModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-4 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      <ArrowUturnLeftIcon className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-white">
                      <h3 className="font-semibold">Request Return</h3>
                      <p className="text-sm text-white/80">{returnMovement.category_name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowReturnModal(false)}
                    className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-4">
                {/* Asset Info */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-500">Returning from</p>
                  <p className="font-medium text-gray-900">{returnMovement.project_name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {returnMovement.item_code || returnMovement.category_code} - {returnMovement.quantity} units
                  </p>
                </div>

                {/* Quantity */}
                {!returnMovement.item_id && returnMovement.quantity > 1 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity to Return
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={returnMovement.quantity}
                      value={returnForm.quantity}
                      onChange={(e) => setReturnForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Max: {returnMovement.quantity}</p>
                  </div>
                )}

                {/* Condition Assessment */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Condition Assessment
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['good', 'fair', 'poor', 'damaged'].map((cond) => (
                      <button
                        key={cond}
                        onClick={() => setReturnForm(prev => ({ ...prev, condition: cond }))}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                          returnForm.condition === cond
                            ? cond === 'good' ? 'bg-green-100 border-green-500 text-green-700'
                              : cond === 'fair' ? 'bg-yellow-100 border-yellow-500 text-yellow-700'
                              : cond === 'poor' ? 'bg-orange-100 border-orange-500 text-orange-700'
                              : 'bg-red-100 border-red-500 text-red-700'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {cond.charAt(0).toUpperCase() + cond.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Damage Description (if not good) */}
                {returnForm.condition !== 'good' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {returnForm.condition === 'damaged' ? 'Damage Description' : 'Condition Details'}
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                    <textarea
                      value={returnForm.damage_description}
                      onChange={(e) => setReturnForm(prev => ({ ...prev, damage_description: e.target.value }))}
                      rows={3}
                      placeholder={
                        returnForm.condition === 'damaged'
                          ? "Describe the damage in detail..."
                          : "Describe the current condition..."
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Notes (Optional)
                  </label>
                  <textarea
                    value={returnForm.notes}
                    onChange={(e) => setReturnForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    placeholder="Any additional information..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReturnRequest}
                  disabled={submitting || (returnForm.condition !== 'good' && !returnForm.damage_description)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <ArrowUturnLeftIcon className="w-4 h-4" />
                      Request Return
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(SiteAssets);
