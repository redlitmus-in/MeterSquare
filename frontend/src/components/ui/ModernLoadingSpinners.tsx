import React from 'react';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  variant?: 'pulse-wave'; // Only pulse-wave variant available
}

const ModernLoadingSpinners: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  className = '',
  variant = 'pulse-wave' // Default and only variant
}) => {
  const sizeValues = {
    sm: 40,
    md: 60,
    lg: 80,
    xl: 100,
  };

  const currentSize = sizeValues[size];

  // Pulse Wave - Animated lines (the only loading animation)
  return (
    <div className={`relative ${className}`} style={{ width: currentSize, height: currentSize }}>
      <div className="flex items-center justify-center h-full gap-1">
        <motion.div
          className="rounded"
          style={{
            width: '3px',
            height: currentSize * 0.5,
            backgroundColor: '#ef4444',
          }}
          animate={{
            scaleY: [0.5, 1, 0.5],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: 0,
            ease: "easeInOut"
          }}
        />
        <motion.div
          className="rounded"
          style={{
            width: '3px',
            height: currentSize * 0.5,
            backgroundColor: '#3b82f6',
          }}
          animate={{
            scaleY: [0.5, 1, 0.5],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: 0.2,
            ease: "easeInOut"
          }}
        />
        <motion.div
          className="rounded"
          style={{
            width: '3px',
            height: currentSize * 0.5,
            backgroundColor: '#10b981',
          }}
          animate={{
            scaleY: [0.5, 1, 0.5],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: 0.4,
            ease: "easeInOut"
          }}
        />
      </div>
    </div>
  );
};

export default ModernLoadingSpinners;