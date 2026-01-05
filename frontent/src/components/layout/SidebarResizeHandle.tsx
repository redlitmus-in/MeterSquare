import React from 'react';
import { clsx } from 'clsx';

interface SidebarResizeHandleProps {
  onResizeStart: () => void;
  onDoubleClick: () => void;
  isResizing: boolean;
  isMobile: boolean;
}

export const SidebarResizeHandle: React.FC<SidebarResizeHandleProps> = ({
  onResizeStart,
  onDoubleClick,
  isResizing,
  isMobile,
}) => {
  if (isMobile) return null;

  return (
    <div
      role="separator"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      tabIndex={0}
      onMouseDown={onResizeStart}
      onDoubleClick={onDoubleClick}
      className={clsx(
        'absolute right-0 top-0 bottom-0 w-1',
        'hover:bg-gray-300 transition-colors duration-150',
        'cursor-col-resize',
        'hidden md:block',
        'z-50',
        isResizing ? 'bg-blue-500' : 'bg-transparent'
      )}
      style={{
        touchAction: 'none',
      }}
    />
  );
};
