import React, { useState, useRef, useEffect } from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { StaticTimePicker } from '@mui/x-date-pickers/StaticTimePicker';
import dayjs, { Dayjs } from 'dayjs';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const TimePicker: React.FC<TimePickerProps> = ({ value, onChange, placeholder = 'HH:MM', className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState<Dayjs | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Parse existing value
  useEffect(() => {
    if (value) {
      setSelectedTime(dayjs(value, 'HH:mm'));
    }
  }, [value]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    // Prevent body scroll when modal is open
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.body.style.overflow = 'unset';
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleAccept = (newValue: Dayjs | null) => {
    if (newValue) {
      const formattedTime = newValue.format('HH:mm');
      onChange(formattedTime);
      setSelectedTime(newValue);
      setIsOpen(false);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const displayValue = value || placeholder;

  return (
    <div className="relative">
      {/* Input field */}
      <div className={`relative ${className}`}>
        <input
          type="text"
          value={displayValue}
          onClick={() => setIsOpen(!isOpen)}
          readOnly
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white cursor-pointer"
        />
        <ClockIcon
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
        />
      </div>

      {/* Dropdown Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div ref={dropdownRef} className="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-hide">
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <StaticTimePicker
                value={selectedTime}
                onChange={(newValue) => setSelectedTime(newValue)}
                onAccept={handleAccept}
                onClose={handleCancel}
                ampm={false}
                slotProps={{
                  actionBar: {
                    actions: ['cancel', 'accept'],
                  },
                }}
              />
            </LocalizationProvider>
          </div>
        </div>
      )}
    </div>
  );
};
