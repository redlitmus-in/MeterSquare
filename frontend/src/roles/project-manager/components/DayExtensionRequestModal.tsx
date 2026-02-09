import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  XMarkIcon,
  CalendarIcon,
  ClockIcon,
  PlusIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { API_BASE_URL } from '@/api/config';

interface DayExtensionRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  boqId: number;
  projectName: string;
  currentDuration?: number;
  startDate?: string;
  endDate?: string;
}

const DayExtensionRequestModal: React.FC<DayExtensionRequestModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  boqId,
  projectName,
  currentDuration = 0,
  startDate,
  endDate
}) => {
  const [additionalDays, setAdditionalDays] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [checkingPending, setCheckingPending] = useState(false);
  const [extensionHistory, setExtensionHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Fetch extension history when modal opens
  useEffect(() => {
    if (isOpen && boqId) {
      fetchExtensionHistory();
    }
  }, [isOpen, boqId]);

  const fetchExtensionHistory = async () => {
    try {
      setCheckingPending(true);
      const token = localStorage.getItem('access_token') || localStorage.getItem('token');

      const response = await fetch(`${API_BASE_URL}/boq/${boqId}/day-extension-history`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setExtensionHistory(data.requests || []);
        setHasPendingRequest(data.has_pending || false);
        setPendingRequestCount(data.pending_count || 0);
        // Auto-show history if there are any requests
        if (data.count > 0) {
          setShowHistory(true);
        }
      }
    } catch (error) {
      console.error('Error fetching extension history:', error);
    } finally {
      setCheckingPending(false);
    }
  };

  // Calculate new end date based on additional days
  const calculateNewEndDate = () => {
    if (!endDate) return null;
    const currentEnd = new Date(endDate);
    const newEnd = new Date(currentEnd);
    newEnd.setDate(currentEnd.getDate() + additionalDays);
    return newEnd.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'day_request_send_td':
      case 'edited_by_td':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">Pending TD Approval</span>;
      case 'approved':
        return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full flex items-center gap-1"><CheckCircleIcon className="w-3 h-3" />Approved</span>;
      case 'rejected':
        return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full flex items-center gap-1"><XCircleIcon className="w-3 h-3" />Rejected</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">{status}</span>;
    }
  };

  const handleSubmit = async () => {
    // Check if there are pending requests
    if (hasPendingRequest) {
      showError(`Cannot create new request. You have ${pendingRequestCount} pending request${pendingRequestCount > 1 ? 's' : ''} awaiting TD approval.`);
      return;
    }

    // Validation
    if (additionalDays <= 0) {
      showError('Additional days must be greater than 0');
      return;
    }

    if (!reason.trim()) {
      showError('Please provide a reason for the extension');
      return;
    }

    // Check if token exists
    const token = localStorage.getItem('access_token') || localStorage.getItem('token');
    if (!token) {
      showError('Authentication token not found. Please login again.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/boq/${boqId}/request-day-extension`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          additional_days: additionalDays,
          reason: reason.trim()
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccess('Day extension request sent to Technical Director');
        // Reset form
        setAdditionalDays(1);
        setReason('');
        // Refresh history
        await fetchExtensionHistory();
        // Call onSuccess callback to refresh data
        if (onSuccess) {
          onSuccess();
        }
      } else {
        // Handle specific error messages
        if (response.status === 401) {
          showError('Unauthorized. Please login again.');
        } else if (response.status === 403) {
          showError('You do not have permission to perform this action.');
        } else {
          showError(data.error || data.message || 'Failed to submit day extension request');
        }
      }
    } catch (error) {
      console.error('Error submitting day extension request:', error);
      showError('Network error. Please check your connection and try again.');
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
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[95vh] flex flex-col"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 rounded-t-xl flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <CalendarIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Request Day Extension</h2>
                <p className="text-xs text-blue-100">{projectName}</p>
              </div>
            </div>
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

        {/* Pending Request Warning */}
        {hasPendingRequest && (
          <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mx-4 mt-4 rounded-lg">
            <div className="flex items-start">
              <InformationCircleIcon className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <div className="ml-3">
                <h3 className="text-sm font-bold text-orange-900">Pending Request Exists</h3>
                <p className="text-sm text-orange-700 mt-1">
                  You have <span className="font-bold">{pendingRequestCount} pending day extension request{pendingRequestCount > 1 ? 's' : ''}</span> awaiting Technical Director approval.
                </p>
                <p className="text-xs text-orange-600 mt-2">
                  You cannot submit a new request until the pending request{pendingRequestCount > 1 ? 's are' : ' is'} approved or rejected.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* History Section */}
          {extensionHistory.length > 0 && (
            <div className="bg-gray-50 rounded-lg border border-gray-200">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <ClockIcon className="w-5 h-5 text-gray-600" />
                  <span className="font-semibold text-gray-900">Request History ({extensionHistory.length})</span>
                </div>
                {showHistory ? <ChevronUpIcon className="w-5 h-5 text-gray-600" /> : <ChevronDownIcon className="w-5 h-5 text-gray-600" />}
              </button>

              {showHistory && (
                <div className="px-4 pb-4 space-y-3 max-h-64 overflow-y-auto">
                  {extensionHistory.map((request, index) => (
                    <div key={index} className="bg-white rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {getStatusBadge(request.status)}
                            <span className="text-xs text-gray-500">
                              {formatDate(request.request_date)}
                            </span>
                          </div>
                          {request.approved_days ? (
                            // Show consolidated info when approved
                            request.approved_days !== request.requested_days ? (
                              <p className="text-sm font-medium text-gray-900">
                                <span className="text-orange-600">Requested: {request.requested_days} day{request.requested_days > 1 ? 's' : ''}</span>
                                {' → '}
                                <span className="text-green-600">TD Approved: {request.approved_days} day{request.approved_days > 1 ? 's' : ''}</span>
                              </p>
                            ) : (
                              <p className="text-sm font-medium text-green-600">
                                Approved: {request.approved_days} day{request.approved_days > 1 ? 's' : ''}
                              </p>
                            )
                          ) : (
                            // Show only requested when pending or rejected
                            <p className="text-sm font-medium text-gray-900">
                              Requested: <span className="text-orange-600">{request.requested_days} day{request.requested_days > 1 ? 's' : ''}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">
                        <span className="font-medium">Reason:</span> {request.reason}
                      </p>
                      {request.rejection_reason && (
                        <p className="text-sm text-red-600">
                          <span className="font-medium">Rejection Reason:</span> {request.rejection_reason}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Requested by: {request.requested_by}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Current Project Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h3 className="text-xs font-bold text-blue-900 mb-2 flex items-center gap-1.5">
              <InformationCircleIcon className="w-4 h-4" />
              Current Project Timeline
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-blue-700 mb-0.5">Duration</p>
                <p className="text-sm font-bold text-blue-900">{currentDuration} days</p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-0.5">Start Date</p>
                <p className="text-xs font-semibold text-blue-900">{formatDate(startDate)}</p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-0.5">Current End Date</p>
                <p className="text-xs font-semibold text-blue-900">{formatDate(endDate)}</p>
              </div>
            </div>
          </div>

          {/* Additional Days Input */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Additional Days Requested *
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                value={additionalDays || ''}
                onChange={(e) => setAdditionalDays(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm"
                placeholder="Enter number of additional days"
              />
              <PlusIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              New total duration will be: <span className="font-bold text-blue-600">{currentDuration + additionalDays} days</span>
            </p>
          </div>

          {/* New End Date Preview */}
          {endDate && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ClockIcon className="w-4 h-4 text-green-600" />
                <p className="text-xs font-bold text-green-900">New End Date (Preview)</p>
              </div>
              <p className="text-base font-bold text-green-700">
                {calculateNewEndDate()}
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                +{additionalDays} day{additionalDays !== 1 ? 's' : ''} from current end date
              </p>
            </div>
          )}

          {/* Reason Input */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Reason for Extension *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all resize-none text-sm"
              placeholder="Please provide a detailed reason for requesting additional days (e.g., weather delays, unforeseen site conditions, design changes, etc.)"
              maxLength={500}
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-gray-500">
                Be specific about the reasons for the delay
              </p>
              <p className="text-xs text-gray-400">
                {reason.length}/500
              </p>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5">
            <p className="text-xs text-yellow-800">
              <span className="font-bold">Note:</span> This request will be sent to the Technical Director for approval.
              The TD may approve, reject, or modify the number of days requested.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-4 py-3 rounded-b-xl flex items-center justify-end gap-2 flex-shrink-0 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-gray-700 bg-white border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !reason.trim() || additionalDays <= 0 || hasPendingRequest}
            className="px-4 py-2 text-sm bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-md"
            title={hasPendingRequest ? 'Cannot submit - pending request exists' : 'Submit day extension request'}
          >
            {checkingPending ? (
              <>
                <ModernLoadingSpinners size="xxs" />
                Checking...
              </>
            ) : isSubmitting ? (
              <>
                <ModernLoadingSpinners size="xxs" />
                Submitting...
              </>
            ) : hasPendingRequest ? (
              <>
                <XMarkIcon className="w-4 h-4" />
                Request Pending
              </>
            ) : (
              <>
                <CalendarIcon className="w-4 h-4" />
                Send Request
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders
export default React.memo(DayExtensionRequestModal);
