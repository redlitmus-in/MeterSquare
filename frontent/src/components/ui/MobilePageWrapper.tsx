import React from 'react';
import { cn } from '@/lib/utils';

interface MobilePageWrapperProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const MobilePageWrapper: React.FC<MobilePageWrapperProps> = ({
  children,
  className = '',
  noPadding = false
}) => {
  return (
    <div 
      className={cn(
        "w-full min-h-screen",
        !noPadding && "p-2 sm:p-4 md:p-6 lg:p-8",
        "max-w-full overflow-x-hidden",
        className
      )}
    >
      <div className="w-full max-w-7xl mx-auto">
        {children}
      </div>
    </div>
  );
};

interface MobileCardProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  onClick?: () => void;
}

export const MobileCard: React.FC<MobileCardProps> = ({
  children,
  className = '',
  noPadding = false,
  onClick
}) => {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-white rounded-lg shadow-sm border border-gray-200",
        !noPadding && "p-3 sm:p-4 md:p-5",
        onClick && "cursor-pointer hover:shadow-md transition-shadow",
        "w-full overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  );
};

interface MobileGridProps {
  children: React.ReactNode;
  columns?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  className?: string;
}

export const MobileGrid: React.FC<MobileGridProps> = ({
  children,
  columns = { mobile: 1, tablet: 2, desktop: 4 },
  className = ''
}) => {
  const gridClass = cn(
    "grid gap-3 sm:gap-4",
    columns.mobile === 1 && "grid-cols-1",
    columns.mobile === 2 && "grid-cols-2",
    columns.tablet && `sm:grid-cols-${columns.tablet}`,
    columns.desktop && `lg:grid-cols-${columns.desktop}`,
    className
  );
  
  return (
    <div className={gridClass}>
      {children}
    </div>
  );
};

interface MobileTableWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export const MobileTableWrapper: React.FC<MobileTableWrapperProps> = ({
  children,
  className = ''
}) => {
  return (
    <div className={cn("w-full", className)}>
      <div className="overflow-x-auto mobile-scroll-x -mx-2 px-2 sm:mx-0 sm:px-0">
        <div className="inline-block min-w-full align-middle">
          {children}
        </div>
      </div>
      {/* Scroll hint for mobile */}
      <div className="sm:hidden text-center mt-2">
        <span className="text-xs text-gray-500">← Swipe for more →</span>
      </div>
    </div>
  );
};