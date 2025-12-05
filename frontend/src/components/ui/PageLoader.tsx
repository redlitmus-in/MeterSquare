import React from 'react';
import ModernLoadingSpinners from './ModernLoadingSpinners';

const PageLoader: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center">
        <ModernLoadingSpinners variant="pulse-wave" size="lg" />
        <p className="mt-4 text-gray-600 text-sm">Loading...</p>
      </div>
    </div>
  );
};

export default PageLoader;