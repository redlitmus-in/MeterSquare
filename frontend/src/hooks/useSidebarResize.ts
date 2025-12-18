import { useState, useEffect, useCallback, useRef } from 'react';
import { useResponsive } from './useResponsive';
import { throttle } from '@/utils/performanceOptimizer';

const MIN_WIDTH = 64;
const MAX_WIDTH = 320;
const DEFAULT_WIDTH = 224;
const TEXT_THRESHOLD = 180;

interface UseSidebarResizeReturn {
  sidebarWidth: number;
  isResizing: boolean;
  isIconOnlyMode: boolean;
  isMobile: boolean;
  startResize: () => void;
  resetWidth: () => void;
  sidebarRef: React.RefObject<HTMLDivElement>;
}

export const useSidebarResize = (): UseSidebarResizeReturn => {
  const { isMobile } = useResponsive();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(initializeWidth);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const sidebarWidthRef = useRef<number>(sidebarWidth);
  const listenersRegisteredRef = useRef<boolean>(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();

  const isIconOnlyMode = sidebarWidth < TEXT_THRESHOLD;

  // Update ref when width changes
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  // Initialize width with backward compatibility
  function initializeWidth(): number {
    try {
      // Check for new key first
      const savedWidth = localStorage.getItem('sidebarWidth');
      if (savedWidth) {
        const width = parseInt(savedWidth, 10);
        return isNaN(width) ? DEFAULT_WIDTH : Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
      }

      // Check for old boolean key (backward compatibility)
      const oldCollapsed = localStorage.getItem('sidebarCollapsed');
      if (oldCollapsed !== null) {
        const width = oldCollapsed === 'true' ? MIN_WIDTH : DEFAULT_WIDTH;
        // Validate before migrating
        const validatedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
        // Migrate to new key
        localStorage.setItem('sidebarWidth', String(validatedWidth));
        localStorage.removeItem('sidebarCollapsed');
        return validatedWidth;
      }
    } catch (error) {
      console.warn('Failed to read sidebar width from localStorage:', error);
    }

    // Default for new users
    return DEFAULT_WIDTH;
  }

  // Debounced save to localStorage with proper cleanup
  const debouncedSave = useCallback((width: number) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem('sidebarWidth', String(width));
      } catch (error) {
        console.warn('Failed to save sidebar width to localStorage:', error);
      }
    }, 300);
  }, []);

  // Broadcast width change for cross-tab sync
  const broadcastChange = useCallback((width: number) => {
    window.dispatchEvent(
      new CustomEvent('sidebarWidthChange', { detail: { width } })
    );
  }, []);

  // Mouse move handler with manual throttling for better control
  const lastMoveTimeRef = useRef<number>(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const now = Date.now();

    // Throttle to 30fps (33ms) - optimal balance between smoothness and performance
    if (now - lastMoveTimeRef.current < 33) {
      return;
    }

    lastMoveTimeRef.current = now;

    if (!sidebarRef.current) return;

    const rect = sidebarRef.current.getBoundingClientRect();
    const newWidth = e.clientX - rect.left;
    const constrainedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));

    setSidebarWidth(constrainedWidth);
    debouncedSave(constrainedWidth);
  }, [debouncedSave]);

  // Prevent text selection during drag
  const preventSelection = useCallback((e: Event) => {
    e.preventDefault();
  }, []);

  // Stop resize
  const stopResize = useCallback(() => {
    if (!listenersRegisteredRef.current) return;

    setIsResizing(false);
    document.body.style.cursor = 'auto';
    document.body.style.userSelect = 'auto';

    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
    document.removeEventListener('selectstart', preventSelection);
    listenersRegisteredRef.current = false;

    // Save immediately on mouse up using ref to get latest width
    try {
      localStorage.setItem('sidebarWidth', String(sidebarWidthRef.current));
    } catch (error) {
      console.warn('Failed to save sidebar width to localStorage:', error);
    }
    broadcastChange(sidebarWidthRef.current);
  }, [broadcastChange, handleMouseMove, preventSelection]);

  // Start resize
  const startResize = useCallback(() => {
    if (isMobile || listenersRegisteredRef.current) return;

    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('selectstart', preventSelection);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
    listenersRegisteredRef.current = true;
  }, [isMobile, handleMouseMove, stopResize, preventSelection]);

  // Reset to default width
  const resetWidth = useCallback(() => {
    setSidebarWidth(DEFAULT_WIDTH);
    try {
      localStorage.setItem('sidebarWidth', String(DEFAULT_WIDTH));
    } catch (error) {
      console.warn('Failed to save sidebar width to localStorage:', error);
    }
    broadcastChange(DEFAULT_WIDTH);
  }, [broadcastChange]);

  // Listen for cross-tab changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sidebarWidth' && e.newValue) {
        const newWidth = parseInt(e.newValue, 10);
        if (!isNaN(newWidth)) {
          setSidebarWidth(newWidth);
        }
      }
    };

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ width: number }>;
      if (customEvent.detail?.width) {
        setSidebarWidth(customEvent.detail.width);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('sidebarWidthChange', handleCustomEvent);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebarWidthChange', handleCustomEvent);
    };
  }, []);

  // Abort resize if window resizes
  useEffect(() => {
    const handleWindowResize = () => {
      if (isResizing) {
        stopResize();
      }
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [isResizing, stopResize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear debounce timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Force cleanup event listeners on unmount
      if (listenersRegisteredRef.current) {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('selectstart', preventSelection);
        document.body.style.cursor = 'auto';
        document.body.style.userSelect = 'auto';
      }
    };
  }, []); // Empty deps - only run on unmount

  return {
    sidebarWidth,
    isResizing,
    isIconOnlyMode,
    isMobile,
    startResize,
    resetWidth,
    sidebarRef,
  };
};
