import React from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Trash2, Clock, FileText } from 'lucide-react';

interface DataRecoveryModalProps {
  open: boolean;
  onRestore: () => void;
  onDiscard: () => void;
  timestamp?: string;
  boqName?: string;
}

/**
 * Modal component to ask user about restoring previously saved data
 *
 * @param open - Whether the modal is open
 * @param onRestore - Callback when user chooses to restore the data
 * @param onDiscard - Callback when user chooses to discard and start fresh
 * @param timestamp - Timestamp of the saved data
 * @param boqName - Name of the BOQ (if available)
 */
const DataRecoveryModal: React.FC<DataRecoveryModalProps> = ({
  open,
  onRestore,
  onDiscard,
  timestamp,
  boqName,
}) => {
  const formatTimestamp = () => {
    if (!timestamp) return 'Unknown time';

    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = Math.floor((now.getTime() - date.getTime()) / 1000); // seconds

      let timeAgo = '';
      if (diff < 60) {
        timeAgo = `${diff} seconds ago`;
      } else if (diff < 3600) {
        timeAgo = `${Math.floor(diff / 60)} minutes ago`;
      } else if (diff < 86400) {
        timeAgo = `${Math.floor(diff / 3600)} hours ago`;
      } else {
        timeAgo = `${Math.floor(diff / 86400)} days ago`;
      }

      return `${date.toLocaleString()} (${timeAgo})`;
    } catch (error) {
      return 'Unknown time';
    }
  };

  if (!open) return null;

  const modalContent = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <RotateCcw className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Recover Unsaved Work?
                </h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  We found previously saved data
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Unsaved BOQ data found
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    It looks like you were working on a BOQ that wasn't completed
                  </p>
                </div>
              </div>
            </div>

            <p className="text-gray-700">
              Would you like to restore your previous work or start fresh?
            </p>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 space-y-2">
              {boqName && (
                <div className="flex items-start gap-2">
                  <span className="text-sm text-gray-600 font-medium min-w-[80px]">
                    BOQ Name:
                  </span>
                  <span className="text-sm text-gray-900 font-semibold">
                    {boqName}
                  </span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs text-gray-600 font-medium">
                    Last Saved:
                  </span>
                  <p className="text-xs text-gray-900 mt-0.5">
                    {formatTimestamp()}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-red-50 rounded-lg p-3 border border-red-200">
              <p className="text-xs text-gray-700">
                <strong>⚠️ Note:</strong> Choosing "Start Fresh" will permanently
                discard the saved data and cannot be undone.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3">
            <button
              onClick={onDiscard}
              className="px-4 py-2.5 border-2 border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-all font-semibold flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Start Fresh
            </button>
            <button
              onClick={onRestore}
              className="px-6 py-2.5 bg-[rgb(36,61,138)] text-white rounded-lg hover:opacity-90 transition-all font-semibold flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Restore Previous Work
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};

export default DataRecoveryModal;
