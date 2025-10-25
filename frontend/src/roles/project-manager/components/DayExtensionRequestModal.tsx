import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  XMarkIcon,
  CalendarIcon,
  ClockIcon,
  PlusIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { toast } from 'sonner';

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

  const handleSubmit = async () => {
    // Validation
    if (additionalDays <= 0) {
      toast.error('Additional days must be greater than 0');
      return;
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason for the extension');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/boq/${boqId}/request-day-extension`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          additional_days: additionalDays,
          reason: reason.trim()
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Day extension request sent to Technical Director');
        // Reset form
        setAdditionalDays(1);
        setReason('');
        onClose();
        // Call onSuccess callback to refresh data
        if (onSuccess) {
          onSuccess();
        }
      } else {
        toast.error(data.error || 'Failed to submit day extension request');
      }
    } catch (error) {
      console.error('Error submitting day extension request:', error);
      toast.error('Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <CalendarIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Request Day Extension</h2>
                <p className="text-sm text-blue-100 mt-0.5">{projectName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Current Project Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
              <InformationCircleIcon className="w-5 h-5" />
              Current Project Timeline
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-blue-700 mb-1">Duration</p>
                <p className="text-lg font-bold text-blue-900">{currentDuration} days</p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-1">Start Date</p>
                <p className="text-sm font-semibold text-blue-900">{formatDate(startDate)}</p>
              </div>
              <div>
                <p className="text-xs text-blue-700 mb-1">Current End Date</p>
                <p className="text-sm font-semibold text-blue-900">{formatDate(endDate)}</p>
              </div>
            </div>
          </div>

          {/* Additional Days Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Additional Days Requested *
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                value={additionalDays}
                onChange={(e) => setAdditionalDays(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                placeholder="Enter number of additional days"
              />
              <PlusIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              New total duration will be: <span className="font-bold text-blue-600">{currentDuration + additionalDays} days</span>
            </p>
          </div>

          {/* New End Date Preview */}
          {endDate && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <ClockIcon className="w-5 h-5 text-green-600" />
                <p className="text-sm font-bold text-green-900">New End Date (Preview)</p>
              </div>
              <p className="text-lg font-bold text-green-700">
                {calculateNewEndDate()}
              </p>
              <p className="text-xs text-green-600 mt-1">
                +{additionalDays} day{additionalDays !== 1 ? 's' : ''} from current end date
              </p>
            </div>
          )}

          {/* Reason Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Reason for Extension *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all resize-none"
              placeholder="Please provide a detailed reason for requesting additional days (e.g., weather delays, unforeseen site conditions, design changes, etc.)"
              maxLength={500}
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-gray-500">
                Be specific about the reasons for the delay
              </p>
              <p className="text-xs text-gray-400">
                {reason.length}/500
              </p>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-800">
              <span className="font-bold">Note:</span> This request will be sent to the Technical Director for approval.
              The TD may approve, reject, or modify the number of days requested.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 rounded-b-2xl flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 text-gray-700 bg-white border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !reason.trim() || additionalDays <= 0}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CalendarIcon className="w-5 h-5" />
                Send Request
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default DayExtensionRequestModal;
