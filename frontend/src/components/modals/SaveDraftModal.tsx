import React from 'react';
import ReactDOM from 'react-dom';
import { Save, Trash2, AlertCircle } from 'lucide-react';

interface SaveDraftModalProps {
  open: boolean;
  onSaveAndClose: () => void;
  onDiscardAndClose: () => void;
  boqName?: string;
  hasImages?: boolean; // Whether the BOQ has uploaded images
}

/**
 * Modal component to ask user if they want to save draft when closing form
 * Uses React Portal to render at document root level for proper overlay positioning
 *
 * @param open - Whether the modal is open
 * @param onSaveAndClose - Callback when user chooses to save draft and close
 * @param onDiscardAndClose - Callback when user chooses to discard and close
 * @param boqName - Name of the BOQ being worked on
 */
const SaveDraftModal: React.FC<SaveDraftModalProps> = ({
  open,
  onSaveAndClose,
  onDiscardAndClose,
  boqName,
  hasImages = false,
}) => {
  if (!open) {
    return null;
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
      }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          maxWidth: '24rem',
          width: '100%',
          position: 'relative',
          zIndex: 100000,
        }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-b border-yellow-100 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-yellow-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Save your work?
              </h2>
              <p className="text-xs text-gray-600">
                You have unsaved changes
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-700">
            You're about to close this form. Would you like to save your work so you can continue later?
          </p>

          {boqName && (
            <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-200">
              <p className="text-xs text-gray-700">
                <strong>BOQ:</strong> {boqName}
              </p>
            </div>
          )}

          {hasImages && (
            <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-900">Important:</p>
                  <p className="text-xs text-amber-800">
                    Uploaded images cannot be saved in draft. You'll need to re-upload them when you resume.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-green-50 border border-green-200 rounded-lg p-2.5">
            <div className="flex items-center gap-2">
              <Save className="w-4 h-4 text-green-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-gray-900">
                Save as Draft (Recommended)
              </p>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-gray-900">
                Discard Changes
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-gray-50 px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onDiscardAndClose}
            className="px-3 py-2 border-2 border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-all font-medium text-sm flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            Discard Changes
          </button>
          <button
            onClick={onSaveAndClose}
            className="px-4 py-2 bg-[rgb(36,61,138)] text-white rounded-lg hover:opacity-90 transition-all font-medium text-sm flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            Save Draft & Close
          </button>
        </div>
      </div>
    </div>
  );

  // Render modal using React Portal at document.body level
  return ReactDOM.createPortal(modalContent, document.body);
};

export default SaveDraftModal;
