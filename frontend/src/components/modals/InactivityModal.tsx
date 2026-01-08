import React from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Save, CheckCircle } from 'lucide-react';

interface InactivityModalProps {
  open: boolean;
  onContinue: () => void;
  onSaveAndClose: () => void;
  lastSaved?: Date | null;
}

/**
 * Modal component shown when user is inactive for a specified period
 *
 * @param open - Whether the modal is open
 * @param onContinue - Callback when user chooses to continue working
 * @param onSaveAndClose - Callback when user chooses to save as draft and close
 * @param lastSaved - Timestamp of last auto-save
 */
const InactivityModal: React.FC<InactivityModalProps> = ({
  open,
  onContinue,
  onSaveAndClose,
  lastSaved,
}) => {
  const formatLastSaved = () => {
    if (!lastSaved) return 'Never';

    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSaved.getTime()) / 1000); // seconds

    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    return `${Math.floor(diff / 3600)} hours ago`;
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
          <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border-b border-orange-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Session Inactivity Detected
                </h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  You've been inactive for 2 hours
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Your work has been backed up locally
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    All changes are safely stored in your browser and won't be lost
                  </p>
                </div>
              </div>
            </div>

            <p className="text-gray-700">
              Would you like to continue working on this BOQ or close and save your
              draft to continue later?
            </p>

            {lastSaved && (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2">
                  <Save className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-700">
                    Last backed up: <strong>{formatLastSaved()}</strong>
                  </span>
                </div>
              </div>
            )}

            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <p className="text-xs text-gray-600">
                💡 Your changes are automatically backed up locally every 3 minutes.
                Click "Create BOQ" when ready to submit.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3">
            <button
              onClick={onSaveAndClose}
              className="px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-all font-semibold flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Close (Draft Saved)
            </button>
            <button
              onClick={onContinue}
              className="px-6 py-2.5 bg-[rgb(36,61,138)] text-white rounded-lg hover:opacity-90 transition-all font-semibold"
            >
              Continue Working
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};

export default InactivityModal;
