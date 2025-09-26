import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, ArrowRight } from 'lucide-react';

// Approval Sequence Component - Scrollable on mobile
interface ApprovalStep {
  name: string;
  status?: 'completed' | 'active' | 'pending';
  color?: string;
}

interface ApprovalSequenceProps {
  steps: ApprovalStep[];
  className?: string;
}

export const ApprovalSequence: React.FC<ApprovalSequenceProps> = ({
  steps,
  className = ''
}) => {
  return (
    <div className={cn("w-full", className)}>
      <div className="overflow-x-auto mobile-scroll-x -mx-2 px-2 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-2 min-w-max pb-2">
          {steps.map((step, index) => (
            <React.Fragment key={index}>
              <div
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap",
                  "border transition-all",
                  step.status === 'completed' && "bg-green-50 border-green-200 text-green-700",
                  step.status === 'active' && "bg-blue-50 border-blue-200 text-blue-700",
                  step.status === 'pending' && "bg-gray-50 border-gray-200 text-gray-600",
                  !step.status && `bg-${step.color || 'gray'}-50 border-${step.color || 'gray'}-200`
                )}
              >
                {step.name}
              </div>
              {index < steps.length - 1 && (
                <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

// Status Card Component - Mobile optimized
interface StatusCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; isUp: boolean };
  className?: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  className = ''
}) => {
  return (
    <div className={cn(
      "bg-white rounded-lg p-3 sm:p-4 border border-gray-200",
      "hover:shadow-md transition-shadow",
      className
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm text-gray-600 truncate">{title}</p>
          <p className="text-lg sm:text-xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-1 truncate">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-1">
              <span className={cn(
                "text-xs font-medium",
                trend.isUp ? "text-green-600" : "text-red-600"
              )}>
                {trend.isUp ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
            </div>
          )}
        </div>
        {icon && (
          <div className="p-2 bg-gray-50 rounded-lg flex-shrink-0">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

// Table Row Card - For mobile table display
interface TableRowCardProps {
  data: Record<string, any>;
  columns: Array<{ key: string; label: string; render?: (value: any) => React.ReactNode }>;
  onClick?: () => void;
  className?: string;
}

export const TableRowCard: React.FC<TableRowCardProps> = ({
  data,
  columns,
  onClick,
  className = ''
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-lg p-3 border border-gray-200",
        onClick && "cursor-pointer hover:shadow-md transition-shadow",
        className
      )}
    >
      {columns.map((column, index) => (
        <div
          key={column.key}
          className={cn(
            "flex justify-between items-start gap-2",
            index > 0 && "mt-2 pt-2 border-t border-gray-100"
          )}
        >
          <span className="text-xs font-medium text-gray-600 min-w-[100px]">
            {column.label}:
          </span>
          <span className="text-sm text-gray-900 text-right flex-1">
            {column.render ? column.render(data[column.key]) : data[column.key] || '-'}
          </span>
        </div>
      ))}
    </div>
  );
};

// Responsive Button Group
interface ButtonGroupProps {
  children: React.ReactNode;
  className?: string;
  fullWidthOnMobile?: boolean;
}

export const ResponsiveButtonGroup: React.FC<ButtonGroupProps> = ({
  children,
  className = '',
  fullWidthOnMobile = true
}) => {
  return (
    <div className={cn(
      "flex gap-2",
      fullWidthOnMobile && "flex-col sm:flex-row",
      className
    )}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child) && fullWidthOnMobile) {
          return React.cloneElement(child as any, {
            className: cn(child.props.className, "w-full sm:w-auto")
          });
        }
        return child;
      })}
    </div>
  );
};

// Flag Badge Component
interface FlagBadgeProps {
  flag: string;
  status?: 'active' | 'inactive' | 'pending';
  className?: string;
}

export const FlagBadge: React.FC<FlagBadgeProps> = ({
  flag,
  status = 'inactive',
  className = ''
}) => {
  return (
    <div className={cn(
      "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
      status === 'active' && "bg-green-100 text-green-700",
      status === 'pending' && "bg-yellow-100 text-yellow-700",
      status === 'inactive' && "bg-gray-100 text-gray-500",
      className
    )}>
      <span className="truncate max-w-[100px]">{flag}</span>
    </div>
  );
};

// Mobile Tabs - Scrollable
interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface MobileTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export const MobileTabs: React.FC<MobileTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  className = ''
}) => {
  return (
    <div className={cn("border-b border-gray-200", className)}>
      <div className="overflow-x-auto mobile-scroll-x -mx-2 px-2 sm:mx-0 sm:px-0">
        <div className="flex gap-1 min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "px-3 py-2 text-sm font-medium whitespace-nowrap",
                "border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};