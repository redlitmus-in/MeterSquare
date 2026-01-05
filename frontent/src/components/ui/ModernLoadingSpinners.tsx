import React from 'react';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const ModernLoadingSpinners: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className = ''
}) => {
  const sizeValues = {
    xxs: 12,  // For tiny inline/button use
    xs: 16,   // For small buttons
    sm: 40,
    md: 60,
    lg: 80,
    xl: 100,
  };

  // Bar width scales with size
  const barWidthValues = {
    xxs: 2,
    xs: 2,
    sm: 3,
    md: 3,
    lg: 4,
    xl: 5,
  };

  // Gap scales with size
  const gapValues = {
    xxs: 'gap-0.5',
    xs: 'gap-0.5',
    sm: 'gap-1',
    md: 'gap-1',
    lg: 'gap-1.5',
    xl: 'gap-2',
  };

  const currentSize = sizeValues[size];
  const barWidth = barWidthValues[size];
  const gapClass = gapValues[size];

  // Pulse Wave - Animated lines (the only loading animation)
  return (
    <div className={`relative inline-flex ${className}`} style={{ width: currentSize, height: currentSize }}>
      <div className={`flex items-center justify-center h-full w-full ${gapClass}`}>
        <motion.div
          className="rounded"
          style={{
            width: `${barWidth}px`,
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
            width: `${barWidth}px`,
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
            width: `${barWidth}px`,
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