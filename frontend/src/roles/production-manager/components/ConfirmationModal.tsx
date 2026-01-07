import React from 'react';
import { THEME_COLORS } from '@/lib/inventoryConstants';

interface ConfirmationModalProps {
  show: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  confirmColor?: keyof typeof THEME_COLORS;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  show,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  confirmColor = 'CONFIRM'
}) => {
  if (!show) return null;

  const getColorClasses = () => {
    switch (confirmColor) {
      case 'DELETE':
        return 'bg-red-600 hover:bg-red-700';
      case 'APPROVE':
        return 'bg-green-600 hover:bg-green-700';
      case 'WARNING':
        return 'bg-yellow-600 hover:bg-yellow-700';
      case 'INFO':
        return 'bg-blue-600 hover:bg-blue-700';
      default:
        return 'bg-purple-600 hover:bg-purple-700';
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-message"
    >
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 id="confirmation-title" className="text-lg font-bold text-gray-900 mb-2">
          {title}
        </h3>
        <p id="confirmation-message" className="text-gray-600 mb-6 whitespace-pre-line leading-relaxed">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-white ${getColorClasses()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
