import React from 'react';
import ModernLoadingSpinners from './ModernLoadingSpinners';

const PageLoader: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <ModernLoadingSpinners size="lg" />
    </div>
  );
};

export default PageLoader;