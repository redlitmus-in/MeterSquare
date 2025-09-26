import React, { Suspense } from 'react';
import ModernLoadingSpinners from './ui/ModernLoadingSpinners';

interface LazyLoadWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const LazyLoadWrapper: React.FC<LazyLoadWrapperProps> = ({
  children,
  fallback
}) => {
  return (
    <Suspense fallback={fallback || <ModernLoadingSpinners variant="pulse-wave" size="sm" />}>
      {children}
    </Suspense>
  );
};

export default LazyLoadWrapper;