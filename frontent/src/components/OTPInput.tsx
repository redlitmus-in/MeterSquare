import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

const OTPInput: React.FC<OTPInputProps> = ({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  className
}) => {
  const [otp, setOtp] = useState<string[]>(new Array(length).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Initialize OTP array from value prop
    const otpArray = value.split('').slice(0, length);
    const newOtp = [...new Array(length).fill('')];
    otpArray.forEach((digit, index) => {
      newOtp[index] = digit;
    });
    setOtp(newOtp);
  }, [value, length]);

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    
    const inputValue = e.target.value;
    
    // Handle paste
    if (inputValue.length > 1) {
      const pastedData = inputValue.slice(0, length).split('');
      const newOtp = [...otp];
      
      pastedData.forEach((digit, i) => {
        if (index + i < length && /^\d$/.test(digit)) {
          newOtp[index + i] = digit;
        }
      });
      
      setOtp(newOtp);
      const otpString = newOtp.join('');
      onChange(otpString);
      
      // Focus last filled input or next empty one
      const lastFilledIndex = newOtp.findLastIndex(digit => digit !== '');
      const targetIndex = Math.min(lastFilledIndex + 1, length - 1);
      inputRefs.current[targetIndex]?.focus();
      
      if (otpString.length === length && onComplete) {
        onComplete(otpString);
      }
      return;
    }
    
    // Only allow digits
    if (inputValue && !/^\d$/.test(inputValue)) return;
    
    const newOtp = [...otp];
    newOtp[index] = inputValue;
    setOtp(newOtp);
    
    const otpString = newOtp.join('');
    onChange(otpString);
    
    // Move to next input
    if (inputValue && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    
    // Call onComplete when all digits are filled
    if (otpString.length === length && onComplete) {
      onComplete(otpString);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    
    // Handle backspace
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newOtp = [...otp];
      
      if (otp[index]) {
        newOtp[index] = '';
        setOtp(newOtp);
        onChange(newOtp.join(''));
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus();
        newOtp[index - 1] = '';
        setOtp(newOtp);
        onChange(newOtp.join(''));
      }
    }
    
    // Handle arrow keys
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <div className={cn("flex gap-2 justify-center", className)}>
      {otp.map((digit, index) => (
        <motion.div
          key={index}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: index * 0.05 }}
        >
          <input
            ref={(el) => (inputRefs.current[index] = el)}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{1}"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onFocus={handleFocus}
            disabled={disabled}
            aria-label={`OTP digit ${index + 1} of ${length}`}
            title={`Enter digit ${index + 1} of ${length}`}
            className={cn(
              "w-10 h-11 md:w-12 md:h-14 text-center text-lg md:text-xl font-semibold",
              "border-2 rounded-lg md:rounded-xl transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-offset-1 md:focus:ring-offset-2",
              digit
                ? "border-[#243d8a] bg-[#243d8a]/5 text-[#243d8a]"
                : "border-gray-300 bg-white",
              "focus:border-[#243d8a] focus:ring-[#243d8a]/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "hover:border-[#243d8a]/50"
            )}
          />
        </motion.div>
      ))}
    </div>
  );
};

export default OTPInput;