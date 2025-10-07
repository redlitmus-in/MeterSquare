import React, { lazy, Suspense } from 'react';
import { useAuthStore } from '@/store/authStore';
import { UserRole } from '@/types';
import { getRoleName } from '@/utils/roleRouting';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

// Lazy load all role-specific dashboards
const AdminDashboard = lazy(() => import('@/pages/dashboards/AdminDashboard'));
const TechnicalDirectorDashboard = lazy(() => import('@/roles/technical-director/pages/TechnicalDirectorHub'));
const EstimatorDashboard = lazy(() => import('@/roles/estimator/pages/EstimatorDashboard'));
const ProjectManagerDashboard = lazy(() => import('@/roles/project-manager/pages/ProjectManagerHub'));
const SiteEngineerDashboard = lazy(() => import('@/roles/site-engineer/pages/Dashboard'));

/**
 * Component that dynamically loads the appropriate dashboard based on user role
 */
const RoleDashboard: React.FC = () => {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse-wave" size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-700">No user data available</h2>
          <p className="text-gray-500 mt-2">Please try logging in again</p>
        </div>
      </div>
    );
  }

  // Get the role name from user (handles both role_id and role string)
  const userRole = (user as any)?.role || getRoleName(user.role_id);
  const roleName = typeof userRole === 'string' ? userRole.toLowerCase() : getRoleName(userRole);

  // Get the dashboard component based on role
  let DashboardComponent: React.LazyExoticComponent<React.FC> | null = null;

  // Handle various role name formats
  switch (roleName) {
    case 'admin':
    case 'Admin':
      DashboardComponent = AdminDashboard;
      break;

    case 'technicaldirector':
    case 'technicalDirector':
    case UserRole.TECHNICAL_DIRECTOR:
      DashboardComponent = TechnicalDirectorDashboard;
      break;

    case 'estimator':
    case 'Estimator':
    case 'estimation':
    case 'Estimation':
    case UserRole.ESTIMATION:
      DashboardComponent = EstimatorDashboard;
      break;

    case 'projectmanager':
    case 'projectManager':
    case UserRole.PROJECT_MANAGER:
      DashboardComponent = ProjectManagerDashboard;
      break;

    case 'siteengineer':
    case 'siteEngineer':
    case 'site engineer':
    case 'site_engineer':
    case UserRole.SITE_ENGINEER:
      DashboardComponent = SiteEngineerDashboard;
      break;

  }

  // Render the dashboard with Suspense boundary
  if (DashboardComponent) {
    return (
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center">
          <ModernLoadingSpinners variant="pulse-wave" size="lg" />
        </div>
      }>
        <DashboardComponent />
      </Suspense>
    );
  }

  // Fallback to a generic dashboard if role is not recognized
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-700">Dashboard not configured</h2>
        <p className="text-gray-500 mt-2">Dashboard for role (ID: {user.role_id}) is not yet available</p>
        <p className="text-xs text-gray-400 mt-1">Resolved to: {roleName}</p>
      </div>
    </div>
  );
};

export default RoleDashboard;