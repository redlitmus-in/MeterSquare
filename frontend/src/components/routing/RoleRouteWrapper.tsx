
import React from 'react';
import { Navigate, useParams, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getRoleFromSlug, getRoleSlug } from '@/utils/roleRouting';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

/**
 * Component that validates role in URL matches authenticated user's role
 * Redirects to correct role-prefixed path if mismatch
 */
const RoleRouteWrapper: React.FC = () => {
  const { role: urlRole } = useParams<{ role: string }>();
  const { user, isAuthenticated, isLoading } = useAuthStore();

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
    return <Navigate to="/login" replace />;
  }

  // Get the expected role slug for the authenticated user
  const expectedRoleSlug = getRoleSlug(user.role_id);
  
  // If URL role doesn't match user's role, redirect to correct path
  if (urlRole !== expectedRoleSlug) {
    // Get current path without role prefix
    const currentPath = window.location.pathname;
    const pathParts = currentPath.split('/').filter(Boolean);
    
    // Remove the incorrect role prefix and build new path
    if (pathParts.length > 0) {
      pathParts.shift(); // Remove role prefix
      const basePath = pathParts.join('/') || 'dashboard';
      return <Navigate to={`/${expectedRoleSlug}/${basePath}`} replace />;
    }
    
    // Default redirect to user's dashboard
    return <Navigate to={`/${expectedRoleSlug}/dashboard`} replace />;
  }

  // URL role matches user's role, render children
  return <Outlet />;
};

export default RoleRouteWrapper;