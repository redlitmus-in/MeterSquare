
import React from 'react';
import { Navigate, useParams, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useAdminViewStore } from '@/store/adminViewStore';
import { getRoleFromSlug, getRoleSlug } from '@/utils/roleRouting';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

/**
 * Component that validates role in URL matches authenticated user's role
 * Redirects to correct role-prefixed path if mismatch
 * Admin users can access any role's routes when viewing as that role
 */
const RoleRouteWrapper: React.FC = () => {
  const { role: urlRole } = useParams<{ role: string }>();
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const { viewingAsRole } = useAdminViewStore();

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

  // Check if user is admin
  const userRole = (user as any)?.role || '';
  const isAdmin = userRole?.toLowerCase() === 'admin';

  // Get the expected role slug for the authenticated user (use role name, not role_id)
  let expectedRoleSlug = getRoleSlug((user as any).role || (user as any).role_name || '');

  // If admin is viewing as another role, allow that role's URL
  if (isAdmin && viewingAsRole && viewingAsRole !== 'admin') {
    expectedRoleSlug = getRoleSlug(viewingAsRole);
  }

  console.log('RoleRouteWrapper - URL role:', urlRole, 'Expected:', expectedRoleSlug, 'Viewing as:', viewingAsRole);

  // If URL role doesn't match expected role, redirect to correct path
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

  // URL role matches expected role, render children
  return <Outlet />;
};

export default RoleRouteWrapper;