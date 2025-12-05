import React, { useState, useEffect, forwardRef } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate, formatDateForInput, parseDateFromDDMMYYYY } from '@/utils/dateFormatter';

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  min?: string; // Allow setting minimum date in YYYY-MM-DD format
  max?: string; // Allow setting maximum date in YYYY-MM-DD format
}

const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, value, onChange, onBlur, placeholder = 'dd/mm/yyyy', min, max, ...props }, ref) => {
    const [displayValue, setDisplayValue] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [internalValue, setInternalValue] = useState('');

    useEffect(() => {
      if (value) {
        // If value is in YYYY-MM-DD format (from date input), convert to DD/MM/YYYY
        if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const date = new Date(value);
          setDisplayValue(formatDate(date));
          setInternalValue(value);
        } 
        // If value is already in DD/MM/YYYY format
        else if (value.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
          setDisplayValue(value);
          setInternalValue(formatDateForInput(value));
        }
        // Otherwise try to format it
        else {
          const formatted = formatDate(value);
          setDisplayValue(formatted);
          setInternalValue(formatDateForInput(formatted));
        }
      } else {
        setDisplayValue('');
        setInternalValue('');
      }
    }, [value]);

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      setDisplayValue(inputValue);

      // Allow typing and validate on complete date
      if (inputValue.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const date = parseDateFromDDMMYYYY(inputValue);
        if (date) {
          const formattedForInput = formatDateForInput(date);
          
          // Check if date meets min/max constraints
          if (min) {
            const inputDate = new Date(formattedForInput);
            const minDate = new Date(min);
            if (inputDate < minDate) {
              // Date is before minimum allowed date
              return;
            }
          }
          if (max) {
            const inputDate = new Date(formattedForInput);
            const maxDate = new Date(max);
            if (inputDate > maxDate) {
              // Date is after maximum allowed date
              return;
            }
          }
          
          setInternalValue(formattedForInput);
          onChange?.(inputValue);
        }
      } else if (inputValue === '') {
        setInternalValue('');
        onChange?.('');
      }
    };

    const handleDatePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const dateValue = e.target.value;
      if (dateValue) {
        const date = new Date(dateValue);
        const formatted = formatDate(date);
        setDisplayValue(formatted);
        setInternalValue(dateValue);
        onChange?.(formatted);
      } else {
        setDisplayValue('');
        setInternalValue('');
        onChange?.('');
      }
      setShowDatePicker(false);
    };

    const handleIconClick = () => {
      setShowDatePicker(true);
      setTimeout(() => {
        const dateInput = document.getElementById('hidden-date-picker') as HTMLInputElement;
        if (dateInput) {
          dateInput.showPicker?.();
        }
      }, 100);
    };

    return (
      <div className="relative">
        <div className="relative">
          <input
            ref={ref}
            type="text"
            value={displayValue}
            onChange={handleTextChange}
            onBlur={onBlur}
            placeholder={placeholder}
            pattern="\d{2}/\d{2}/\d{4}"
            className={cn(
              "flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
            {...props}
          />
          <button
            type="button"
            onClick={handleIconClick}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Open date picker"
            title="Open date picker"
          >
            <Calendar className="w-4 h-4" />
          </button>
        </div>
        
        {/* Hidden native date picker */}
        <input
          id="hidden-date-picker"
          type="date"
          value={internalValue}
          onChange={handleDatePickerChange}
          className="absolute opacity-0 pointer-events-none"
          tabIndex={-1}
          aria-label="Date picker"
          title="Date picker"
          min={min}
          max={max}
        />
      </div>
    );
  }
);

DateInput.displayName = 'DateInput';

export { DateInput };