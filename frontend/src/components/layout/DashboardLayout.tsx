import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ModernSidebar from './ModernSidebar';
import NotificationSystem from '@/components/NotificationSystem';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { getRoleDisplayName } from '@/utils/roleRouting';
import { MobileMenuButton } from './MobileMenuButton';
import { Clock } from 'lucide-react';
import { sanitizeDocumentTitle } from '@/utils/sanitizer';
import { useAdminViewStore } from '@/store/adminViewStore';
import { throttle } from '@/utils/performanceOptimizer';

const DashboardLayout: React.FC = React.memo(() => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showHeader, setShowHeader] = useState(true);
  const lastScrollYRef = useRef(0);  // Use ref instead of state to avoid re-renders
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const { user } = useAuthStore();
  const { unreadCount } = useNotificationStore();
  const { viewingAsRoleName } = useAdminViewStore();
  const location = useLocation();

  // Memoize page name calculation
  const getPageName = useCallback(() => {
    const path = location.pathname;
    switch (path) {
      case '/dashboard': return 'Dashboard';
      case '/procurement': return 'Procurement';
      case '/tasks': return 'Tasks';
      case '/process-flow': return 'Process Flow';
      case '/analytics': return 'Analytics';
      case '/profile': return 'Profile';
      default:
        if (path.startsWith('/procurement')) return 'Procurement';
        return 'MeterSquare ERP';
    }
  }, [location.pathname]);

  // Check if current page is a dashboard
  const isDashboardPage = useMemo(() => {
    const path = location.pathname;
    return path === '/dashboard' || path.endsWith('/dashboard') || path.includes('/dashboard/');
  }, [location.pathname]);

  // Memoize time and date formatting
  const formattedTime = useMemo(() => currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }), [currentTime]);

  const formattedDate = useMemo(() => currentTime.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }), [currentTime]);

  // Update browser title with user role and notification count
  useEffect(() => {
    // For admin viewing as another role, show viewing context
    let roleName = user?.role || user?.role_name ? getRoleDisplayName(user?.role || user?.role_name || '') : 'User';

    // If admin is viewing as another role, override with viewing context
    if (user?.role?.toLowerCase() === 'admin' && viewingAsRoleName) {
      roleName = `Admin (${viewingAsRoleName})`;
    }

    const pageName = getPageName();
    const baseTitle = `[${roleName}] ${pageName} - MeterSquare ERP`;

    // Sanitize title to prevent injection
    const sanitizedTitle = unreadCount > 0
      ? sanitizeDocumentTitle(`(${unreadCount}) ${baseTitle}`)
      : sanitizeDocumentTitle(baseTitle);

    document.title = sanitizedTitle;
  }, [user, getPageName, unreadCount, viewingAsRoleName]);

  // Listen for storage changes to sync sidebar state
  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('sidebarCollapsed');
      setSidebarCollapsed(saved === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    // Also listen for custom event for same-tab updates
    window.addEventListener('sidebarToggle', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebarToggle', handleStorageChange);
    };
  }, []);

  // Use interval instead of RAF for time updates to reduce CPU usage
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Update every second

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Handle scroll to hide/show header - throttled to reduce re-renders (was causing 60 re-renders/sec)
  useEffect(() => {
    const mainContent = document.querySelector('main');
    if (!mainContent) return;

    // Throttle scroll handler to run at most every 100ms (reduces re-renders by ~90%)
    const handleScroll = throttle(() => {
      const currentScrollY = mainContent.scrollTop;
      const lastScrollY = lastScrollYRef.current;

      if (currentScrollY > lastScrollY && currentScrollY > 50) {
        // Scrolling down
        setShowHeader(false);
      } else {
        // Scrolling up or at top
        setShowHeader(true);
      }

      lastScrollYRef.current = currentScrollY;
    }, 100);

    mainContent.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      mainContent.removeEventListener('scroll', handleScroll);
    };
  }, []);  // Empty deps - handler is stable due to throttle and ref

  // Delay rendering NotificationSystem to prevent flash in wrong position
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLayoutReady(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="h-screen flex overflow-hidden bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Mobile Menu Button */}
      <MobileMenuButton onClick={() => setSidebarOpen(true)} />
      
      {/* Sidebar - Responsive */}
      <ModernSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

      {/* Main content */}
      <div className={`flex-1 overflow-hidden flex flex-col transition-[padding-left] duration-200 ease-in-out ${
        sidebarCollapsed ? 'md:pl-16' : 'md:pl-56'
      }`}>
        {/* Page content */}
        <main className="flex-1 relative overflow-y-auto overflow-x-hidden focus:outline-none bg-gradient-to-br from-gray-50/50 to-white">
          <div className="min-h-full w-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Floating Notifications - Now available globally for toast notifications */}
      {isLayoutReady && (
        <div className={`fixed top-16 right-4 z-[100] transition-all duration-300`}>
          <NotificationSystem />
        </div>
      )}

      {/* Admin View Context Indicator - Show only for admin when viewing as another role */}
      {user?.role?.toLowerCase() === 'admin' && viewingAsRoleName && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-40 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full px-4 py-2 shadow-lg border border-white/20">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              Admin viewing as:
            </span>
            <span className="font-bold">{viewingAsRoleName}</span>
          </div>
        </div>
      )}

      {/* Date and Time Display - Show only on dashboard pages */}
      {isDashboardPage && (
        <div className={`fixed top-4 right-4 z-30 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 shadow-md transition-all duration-300 ${showHeader ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'}`}>
          <div className="flex items-center gap-2.5 text-sm">
            <Clock className="w-4 h-4 text-gray-500" />
            <div className="flex items-center gap-2.5">
              <span className="font-semibold text-gray-800">
                {formattedTime}
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-600 font-medium">
                {formattedDate}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

DashboardLayout.displayName = 'DashboardLayout';

export default DashboardLayout;