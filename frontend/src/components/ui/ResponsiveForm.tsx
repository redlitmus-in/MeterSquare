import React from 'react';
import { useResponsive } from '@/hooks/useResponsive';
import { CollapsibleSection } from './CollapsibleSection';
import { ScrollArea } from './scroll-area';
import { cn } from '@/lib/utils';

interface ResponsiveFormFieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
}

export const ResponsiveFormField: React.FC<ResponsiveFormFieldProps> = ({
  label,
  required,
  children,
  className = '',
  fullWidth = false
}) => {
  const { isMobile } = useResponsive();
  
  return (
    <div className={cn(
      "w-full",
      !fullWidth && !isMobile && "md:w-1/2 md:pr-2",
      className
    )}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
};

interface ResponsiveFormSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const ResponsiveFormSection: React.FC<ResponsiveFormSectionProps> = ({
  title,
  children,
  defaultOpen = true,
  icon,
  className = ''
}) => {
  const { isMobile } = useResponsive();
  
  if (isMobile) {
    return (
      <CollapsibleSection
        title={title}
        defaultOpen={defaultOpen}
        icon={icon}
        className={className}
      >
        {children}
      </CollapsibleSection>
    );
  }
  
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 md:p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        {icon && <span className="text-gray-600">{icon}</span>}
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  );
};

interface ResponsiveFormLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export const ResponsiveFormLayout: React.FC<ResponsiveFormLayoutProps> = ({
  children,
  className = ''
}) => {
  const { isMobile } = useResponsive();
  
  return (
    <div className={cn(
      "w-full",
      isMobile ? "px-3 py-2" : "px-4 py-4",
      className
    )}>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
};

// Responsive grid for form fields
interface ResponsiveFieldGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

export const ResponsiveFieldGrid: React.FC<ResponsiveFieldGridProps> = ({
  children,
  columns = 2,
  className = ''
}) => {
  const gridClass = {
    1: 'grid grid-cols-1',
    2: 'grid grid-cols-1 md:grid-cols-2',
    3: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
  };
  
  return (
    <div className={cn(gridClass[columns], 'gap-3 md:gap-4', className)}>
      {children}
    </div>
  );
};

// Responsive table wrapper with horizontal scroll
interface ResponsiveTableWrapperProps {
  children: React.ReactNode;
  className?: string;
  showScrollHint?: boolean;
}

export const ResponsiveTableWrapper: React.FC<ResponsiveTableWrapperProps> = ({
  children,
  className = '',
  showScrollHint = true
}) => {
  const { isMobile } = useResponsive();
  
  if (!isMobile) {
    return <div className={className}>{children}</div>;
  }
  
  return (
    <div className={`relative ${className}`}>
      <div className="overflow-x-auto -mx-3 px-3">
        <div className="min-w-[600px]">
          {children}
        </div>
      </div>
      {showScrollHint && (
        <div className="absolute bottom-0 right-0 bg-gradient-to-l from-white via-white to-transparent px-4 py-2 pointer-events-none md:hidden">
          <span className="text-xs text-gray-500">← Swipe to see more →</span>
        </div>
      )}
    </div>
  );
};

// Mobile-optimized tabs
interface ResponsiveTabsProps {
  tabs: Array<{
    id: string;
    label: string;
    icon?: React.ReactNode;
    content: React.ReactNode;
  }>;
  defaultTab?: string;
  className?: string;
}

export const ResponsiveTabs: React.FC<ResponsiveTabsProps> = ({
  tabs,
  defaultTab,
  className = ''
}) => {
  const [activeTab, setActiveTab] = React.useState(defaultTab || tabs[0]?.id);
  const { isMobile } = useResponsive();
  
  return (
    <div className={className}>
      {/* Tab Headers - Scrollable on mobile */}
      <div className={cn(
        "border-b border-gray-200",
        isMobile && "overflow-x-auto -mx-3 px-3"
      )}>
        <div className={cn(
          "flex",
          isMobile && "min-w-max"
        )}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2 font-medium text-sm whitespace-nowrap transition-colors",
                "border-b-2 -mb-px",
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              )}
            >
              <div className="flex items-center gap-2">
                {tab.icon}
                {tab.label}
              </div>
            </button>
          ))}
        </div>
      </div>
      
      {/* Tab Content */}
      <div className="mt-4">
        {tabs.find(tab => tab.id === activeTab)?.content}
      </div>
    </div>
  );
};

// Responsive button group
interface ResponsiveButtonGroupProps {
  children: React.ReactNode;
  className?: string;
  stackOnMobile?: boolean;
}

export const ResponsiveButtonGroup: React.FC<ResponsiveButtonGroupProps> = ({
  children,
  className = '',
  stackOnMobile = true
}) => {
  const { isMobile } = useResponsive();
  
  return (
    <div className={cn(
      "flex gap-2",
      isMobile && stackOnMobile ? "flex-col" : "flex-row",
      className
    )}>
      {React.Children.map(children, child => {
        if (React.isValidElement(child) && isMobile && stackOnMobile) {
          return React.cloneElement(child as any, {
            className: cn(child.props.className, "w-full")
          });
        }
        return child;
      })}
    </div>
  );
};