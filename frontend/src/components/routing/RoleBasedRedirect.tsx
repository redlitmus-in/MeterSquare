import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getRoleSlug } from '@/utils/roleRouting';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

interface RoleBasedRedirectProps {
  children?: React.ReactNode;
}

/**
 * Component that handles authentication redirection
 * Ensures users are authenticated before accessing protected routes
 * and redirects them to their role-specific dashboard
 */
const RoleBasedRedirect: React.FC<RoleBasedRedirectProps> = ({ children }) => {
  const { user, isAuthenticated, isLoading, getRoleDashboard } = useAuthStore();
  const location = useLocation();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" size="lg" />
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If user is authenticated and at root, redirect to role-specific dashboard
  if (location.pathname === '/') {
    const dashboardPath = getRoleDashboard();
    return <Navigate to={dashboardPath} replace />;
  }

  // Otherwise, render children
  return <>{children}</>;
};

export default RoleBasedRedirect;