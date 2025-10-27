import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  XMarkIcon,
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  PencilIcon,
  InformationCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';

interface ExtensionRequest {
  boq_id: number;
  history_id: number;
  project_name: string;
  requested_by: string;
  original_duration: number;
  requested_days: number;
  original_requested_days?: number; // Store original before editing
  new_duration: number;
  original_end_date: string;
  new_end_date: string;
  reason: string;
  request_date: string;
  edited_days?: number | null;
  actual_days?: number;
  status?: string;
  is_edited?: boolean;
}

interface DayExtensionApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (action?: 'approved' | 'rejected' | 'edited') => void;
  extensionRequests: ExtensionRequest[];
}

const DayExtensionApprovalModal: React.FC<DayExtensionApprovalModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  extensionRequests
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [action, setAction] = useState<'approve' | 'alter' | 'reject' | null>(null);
  const [localRequests, setLocalRequests] = useState<ExtensionRequest[]>(extensionRequests);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get current extension request from local state
  const extensionRequest = localRequests[currentIndex] || localRequests[0];

  // Use edited_days if request was edited, otherwise use requested_days
  const initialDays = extensionRequest?.is_edited && extensionRequest.edited_days
    ? extensionRequest.edited_days
    : extensionRequest?.requested_days || 0;
  const [alteredDays, setAlteredDays] = useState(initialDays);

  // Update local state when props change
  React.useEffect(() => {
    setLocalRequests(extensionRequests);
  }, [extensionRequests]);

  // Update alteredDays when switching between requests
  React.useEffect(() => {
    const currentRequest = localRequests[currentIndex];
    if (currentRequest) {
      const days = currentRequest.is_edited && currentRequest.edited_days
        ? currentRequest.edited_days
        : currentRequest.requested_days;
      setAlteredDays(days);
    }
  }, [currentIndex, localRequests]);

  // Reset action when navigating between requests
  const navigateRequest = (direction: 'prev' | 'next') => {
    setAction(null);
    setRejectionReason('');
    if (direction === 'prev') {
      setCurrentIndex(prev => Math.max(0, prev - 1));
    } else {
      setCurrentIndex(prev => Math.min(localRequests.length - 1, prev + 1));
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const calculateNewEndDate = (days: number) => {
    if (!extensionRequest.original_end_date) return 'N/A';
    const currentEnd = new Date(extensionRequest.original_end_date);
    const newEnd = new Date(currentEnd);
    newEnd.setDate(currentEnd.getDate() + days);
    return newEnd.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleSubmit = async () => {
    if (action === 'reject' && !rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    if (action === 'alter' && alteredDays <= 0) {
      toast.error('Days must be greater than 0');
      return;
    }

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');
      const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000/api';

      let endpoint = '';
      let body = {};

      if (action === 'approve') {
        endpoint = `${apiUrl}/boq/${extensionRequest.boq_id}/approve-day-extension/${extensionRequest.history_id}`;
        // Use edited_days if request was edited, otherwise use requested_days
        const daysToApprove = extensionRequest.is_edited
          ? (extensionRequest.edited_days || extensionRequest.actual_days || extensionRequest.requested_days)
          : extensionRequest.requested_days;

        body = {
          approved_days: daysToApprove
        };

        console.log(`Approving with ${daysToApprove} days (edited: ${extensionRequest.is_edited}, edited_days: ${extensionRequest.edited_days})`);
      } else if (action === 'alter') {
        // Use edit endpoint instead of approve
        endpoint = `${apiUrl}/boq/${extensionRequest.boq_id}/edit-day-extension/${extensionRequest.history_id}`;
        body = {
          edited_days: alteredDays,
          comments: `TD modified from ${extensionRequest.requested_days} to ${alteredDays} days`
        };
      } else if (action === 'reject') {
        endpoint = `${apiUrl}/boq/${extensionRequest.boq_id}/reject-day-extension/${extensionRequest.history_id}`;
        body = {
          rejection_reason: rejectionReason.trim()
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (action === 'approve') {
          toast.success('Day extension request approved');
          onClose();
          if (onSuccess) {
            onSuccess('approved');
          }
        } else if (action === 'alter') {
          toast.success(`Extension days edited to ${alteredDays} days. Now please approve or reject the request.`, {
            duration: 4000
          });

          // Update the local state properly to trigger re-render
          const updatedRequests = [...localRequests];
          const currentRequest = updatedRequests[currentIndex];

          if (currentRequest) {
            // Store original if not already edited
            if (!currentRequest.is_edited) {
              currentRequest.original_requested_days = currentRequest.requested_days;
            }

            // Update the request with edited values
            currentRequest.is_edited = true;
            currentRequest.edited_days = alteredDays;
            currentRequest.status = 'edited_by_td';
            currentRequest.actual_days = alteredDays;

            // Recalculate new end date with edited days
            if (currentRequest.original_end_date) {
              const newDate = new Date(currentRequest.original_end_date);
              newDate.setDate(newDate.getDate() + alteredDays);
              currentRequest.new_end_date = newDate.toISOString();
            }

            // Update the local state to trigger re-render
            setLocalRequests(updatedRequests);
          }

          // Reset action to show the main buttons again
          setAction(null);
          // alteredDays will be updated by the useEffect
          // Don't call onSuccess for edit - wait for approve/reject
        } else if (action === 'reject') {
          toast.success('Day extension request rejected');
          onClose();
          if (onSuccess) {
            onSuccess('rejected');
          }
        }
      } else {
        if (response.status === 401) {
          toast.error('Unauthorized. Please login again.');
        } else if (response.status === 403) {
          toast.error('You do not have permission to perform this action.');
        } else if (data.error && (data.error.includes('already approved') || data.error.includes('approved'))) {
          toast.info('This request has already been approved.');
          onClose();
          if (onSuccess) {
            onSuccess('approved'); // Remove from pending list
          }
        } else if (data.error && (data.error.includes('already rejected') || data.error.includes('rejected'))) {
          toast.info('This request has already been rejected.');
          onClose();
          if (onSuccess) {
            onSuccess('rejected'); // Remove from pending list
          }
        } else {
          toast.error(data.error || data.message || 'Failed to process request');
        }
      }
    } catch (error) {
      console.error('Error processing day extension request:', error);
      toast.error('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[95vh] flex flex-col"
      >
        {/* Header */}
        <div className="bg-blue-500 px-4 py-3 rounded-t-xl flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <ClockIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Day Extension Request</h2>
                <p className="text-xs text-blue-100">{extensionRequest.project_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Navigation for multiple requests */}
              {extensionRequests.length > 1 && (
                <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => navigateRequest('prev')}
                    disabled={currentIndex === 0}
                    className="p-1 hover:bg-white/20 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Previous Request"
                  >
                    <ChevronLeftIcon className="w-4 h-4 text-white" />
                  </button>
                  <span className="text-white text-xs font-medium whitespace-nowrap">
                    Request {currentIndex + 1} of {extensionRequests.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigateRequest('next')}
                    disabled={currentIndex === extensionRequests.length - 1}
                    className="p-1 hover:bg-white/20 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next Request"
                  >
                    <ChevronRightIcon className="w-4 h-4 text-white" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                title="Close"
                aria-label="Close modal"
              >
                <XMarkIcon className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Request Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <h3 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
              <InformationCircleIcon className="w-4 h-4" />
              Request Information
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Requested by:</span>
                <span className="font-semibold text-gray-900">{extensionRequest.requested_by}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Request Date:</span>
                <span className="font-semibold text-gray-900">{formatDate(extensionRequest.request_date)}</span>
              </div>
            </div>
          </div>

          {/* Current Timeline */}
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <h3 className="text-xs font-bold text-gray-900 mb-2">Current Project Timeline</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-gray-600 mb-0.5">Current Duration</p>
                <p className="text-sm font-bold text-gray-900">{extensionRequest.original_duration} days</p>
              </div>
              <div>
                <p className="text-gray-600 mb-0.5">Current End Date</p>
                <p className="text-sm font-bold text-gray-900">{formatDate(extensionRequest.original_end_date)}</p>
              </div>
            </div>
          </div>

          {/* Requested Extension */}
          <div className={`${extensionRequest.is_edited ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'} border rounded-lg p-3`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-gray-900">
                {extensionRequest.is_edited ? 'Edited Extension' : 'Requested Extension'}
              </h3>
              {extensionRequest.is_edited && (
                <span className="px-2 py-0.5 bg-orange-500 text-white text-xs font-medium rounded-full">
                  Edited by TD
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-gray-600 mb-0.5">
                  {extensionRequest.is_edited ? 'TD Edited Days' : 'Additional Days'}
                </p>
                {extensionRequest.is_edited ? (
                  <div>
                    <p className="text-sm text-gray-500 line-through">
                      +{extensionRequest.original_requested_days || extensionRequest.requested_days} days
                    </p>
                    <p className="text-lg font-bold text-orange-600">
                      +{extensionRequest.edited_days || extensionRequest.actual_days} days
                    </p>
                  </div>
                ) : (
                  <p className="text-lg font-bold text-blue-600">+{extensionRequest.requested_days} days</p>
                )}
              </div>
              <div>
                <p className="text-gray-600 mb-0.5">New End Date</p>
                <p className="text-sm font-bold text-gray-900">{formatDate(extensionRequest.new_end_date)}</p>
              </div>
            </div>
            {extensionRequest.is_edited && (
              <div className="mt-2 pt-2 border-t border-orange-200">
                <p className="text-xs text-orange-700">
                  <span className="font-semibold">Note:</span> TD modified the requested extension. Please review and approve the edited request.
                </p>
              </div>
            )}
          </div>

          {/* Reason */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <h3 className="text-xs font-bold text-gray-900 mb-2">Reason for Extension</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{extensionRequest.reason}</p>
          </div>

          {/* Action Selection */}
          {!action && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-900">Choose Action:</h3>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAction('approve')}
                  className="px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-1.5"
                >
                  <CheckCircleIcon className="w-4 h-4" />
                  <span>Approve</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAction('alter')}
                  className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-1.5"
                >
                  <PencilIcon className="w-4 h-4" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAction('reject')}
                  className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors text-sm flex items-center justify-center gap-1.5"
                >
                  <XCircleIcon className="w-4 h-4" />
                  <span>Reject</span>
                </button>
              </div>
            </div>
          )}

          {/* Edit Days Input */}
          {action === 'alter' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Edit Extension Days *
              </label>
              <input
                type="number"
                min="1"
                value={alteredDays}
                onChange={(e) => setAlteredDays(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm"
                placeholder="Enter new number of days"
              />
              <div className="mt-2 bg-white rounded-lg p-2">
                <p className="text-xs text-gray-600">Original Request: <span className="font-semibold">{extensionRequest.requested_days} days</span></p>
                <p className="text-xs text-gray-600 mt-1">New Request: <span className="font-semibold text-blue-700">{alteredDays} days</span></p>
                <p className="text-xs text-gray-600 mt-1">New End Date Preview:</p>
                <p className="text-sm font-bold text-blue-700">{calculateNewEndDate(alteredDays)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Total Duration: {extensionRequest.original_duration + alteredDays} days
                </p>
              </div>
            </div>
          )}

          {/* Rejection Reason */}
          {action === 'reject' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Reason for Rejection *
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-all resize-none text-sm"
                placeholder="Please provide a clear reason for rejecting this request..."
                maxLength={500}
              />
              <p className="text-xs text-gray-500 mt-1">{rejectionReason.length}/500</p>
            </div>
          )}

          {/* Confirmation Summary */}
          {action && (
            <div className="bg-gray-100 border border-gray-300 rounded-lg p-3">
              <h3 className="text-xs font-bold text-gray-900 mb-2">Summary</h3>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Action:</span>
                  <span className={`font-bold ${
                    action === 'approve' ? 'text-green-700' :
                    action === 'alter' ? 'text-blue-700' :
                    'text-red-700'
                  }`}>
                    {action === 'approve' ? 'Approve Request' :
                     action === 'alter' ? 'Edit Extension Days' :
                     'Reject Request'}
                  </span>
                </div>
                {action !== 'reject' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Days to Grant:</span>
                      <span className="font-bold text-gray-900">
                        {action === 'approve'
                          ? (extensionRequest.is_edited
                            ? extensionRequest.edited_days || extensionRequest.actual_days
                            : extensionRequest.requested_days)
                          : alteredDays} days
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">New Total Duration:</span>
                      <span className="font-bold text-gray-900">
                        {extensionRequest.original_duration +
                          (action === 'approve'
                            ? (extensionRequest.is_edited
                              ? (extensionRequest.edited_days || extensionRequest.actual_days)
                              : extensionRequest.requested_days)
                            : alteredDays)} days
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-4 py-3 rounded-b-xl flex items-center justify-end gap-2 flex-shrink-0 border-t border-gray-200">
          {action && (
            <button
              type="button"
              onClick={() => {
                setAction(null);
                setRejectionReason('');
                // Reset to current value (edited or original)
                const currentDays = extensionRequest.is_edited && extensionRequest.edited_days
                  ? extensionRequest.edited_days
                  : extensionRequest.requested_days;
                setAlteredDays(currentDays);
              }}
              className="px-4 py-2 text-sm text-gray-700 bg-white border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-gray-700 bg-white border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {action && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || (action === 'reject' && !rejectionReason.trim()) || (action === 'alter' && alteredDays <= 0)}
              className={`px-3 py-1.5 text-sm text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 ${
                action === 'approve' ? 'bg-green-500 hover:bg-green-600' :
                action === 'alter' ? 'bg-blue-500 hover:bg-blue-600' :
                'bg-red-500 hover:bg-red-600'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  {action === 'approve' && <CheckCircleIcon className="w-4 h-4" />}
                  {action === 'alter' && <PencilIcon className="w-4 h-4" />}
                  {action === 'reject' && <XCircleIcon className="w-4 h-4" />}
                  {action === 'approve' ? 'Approve' :
                   action === 'alter' ? 'Save Changes' :
                   'Reject'}
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default DayExtensionApprovalModal;
