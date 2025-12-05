import React from 'react';
import { useResponsive } from '../../hooks/useResponsive';
import { ChevronRight } from 'lucide-react';

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
  className?: string;
}

interface ResponsiveTableProps {
  data: any[];
  columns: Column[];
  className?: string;
  onRowClick?: (row: any) => void;
}

export const ResponsiveTable: React.FC<ResponsiveTableProps> = ({
  data,
  columns,
  className = '',
  onRowClick
}) => {
  const { isMobile } = useResponsive();

  if (isMobile) {
    // Mobile: Card View - All data visible
    return (
      <div className={`space-y-3 ${className}`}>
        {data.map((row, rowIndex) => (
          <div
            key={rowIndex}
            onClick={() => onRowClick?.(row)}
            className={`
              bg-white rounded-lg shadow-sm border border-gray-200 p-4
              ${onRowClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}
            `}
          >
            {columns.map((column, colIndex) => {
              const value = row[column.key];
              const displayValue = column.render ? column.render(value, row) : value;
              
              return (
                <div
                  key={colIndex}
                  className={`
                    ${colIndex > 0 ? 'mt-3 pt-3 border-t border-gray-100' : ''}
                    flex justify-between items-start gap-2
                  `}
                >
                  <span className="text-sm font-medium text-gray-600 min-w-[100px]">
                    {column.label}:
                  </span>
                  <span className="text-sm text-gray-900 text-right flex-1">
                    {displayValue || '-'}
                  </span>
                </div>
              );
            })}
            {onRowClick && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>
        ))}
        {data.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No data available
          </div>
        )}
      </div>
    );
  }

  // Desktop: Traditional Table
  return (
    <div className={`overflow-x-auto mobile-scroll-x ${className}`}>
      <table className="min-w-full divide-y divide-gray-200 responsive-table">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column, index) => (
              <th
                key={index}
                className={`
                  px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider
                  ${column.className || ''}
                `}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? 'hover:bg-gray-50 cursor-pointer' : ''}
            >
              {columns.map((column, colIndex) => {
                const value = row[column.key];
                const displayValue = column.render ? column.render(value, row) : value;
                
                return (
                  <td
                    key={colIndex}
                    className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${column.className || ''}`}
                  >
                    {displayValue || '-'}
                  </td>
                );
              })}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-6 py-8 text-center text-gray-500">
                No data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

// Export a variant for wide tables with horizontal scroll
export const ScrollableTable: React.FC<ResponsiveTableProps & { minWidth?: string }> = ({
  minWidth = '800px',
  ...props
}) => {
  const { isMobile } = useResponsive();
  
  if (isMobile) {
    return <ResponsiveTable {...props} />;
  }
  
  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <ResponsiveTable {...props} />
        </div>
      </div>
      {isMobile && (
        <div className="absolute bottom-0 right-0 bg-gradient-to-l from-white to-transparent px-4 py-2 pointer-events-none">
          <span className="text-xs text-gray-500">← Swipe →</span>
        </div>
      )}
    </div>
  );
};