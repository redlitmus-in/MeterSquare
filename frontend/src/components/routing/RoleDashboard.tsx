import React, { lazy, Suspense } from 'react';
import { useAuthStore } from '@/store/authStore';
import { UserRole } from '@/types';
import { getRoleName } from '@/utils/roleRouting';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

// Lazy load all role-specific dashboards
const TechnicalDirectorDashboard = lazy(() => import('@/pages/dashboards/TechnicalDirectorDashboard'));
const ProjectManagerDashboard = lazy(() => import('@/pages/dashboards/ProjectManagerDashboard'));
const ProcurementDashboard = lazy(() => import('@/pages/dashboards/ProcurementDashboard'));
const SiteSupervisorDashboard = lazy(() => import('@/pages/dashboards/SiteSupervisorDashboard'));
const MEPSupervisorDashboard = lazy(() => import('@/pages/dashboards/MEPSupervisorDashboard'));
const EstimationDashboard = lazy(() => import('@/pages/dashboards/EstimationDashboard'));
const AccountsDashboard = lazy(() => import('@/pages/dashboards/AccountsDashboard'));
const DesignDashboard = lazy(() => import('@/pages/dashboards/DesignDashboard'));

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

  // Get the role name from role_id (handles both numeric and string formats)
  const roleName = getRoleName(user.role_id);

  // Get the dashboard component based on role
  let DashboardComponent: React.LazyExoticComponent<React.FC> | null = null;

  switch (roleName) {
    case UserRole.TECHNICAL_DIRECTOR:
      DashboardComponent = TechnicalDirectorDashboard;
      break;

    case UserRole.PROJECT_MANAGER:
      DashboardComponent = ProjectManagerDashboard;
      break;

    case UserRole.PROCUREMENT:
      DashboardComponent = ProcurementDashboard;
      break;

    case UserRole.SITE_SUPERVISOR:
      DashboardComponent = SiteSupervisorDashboard;
      break;

    case UserRole.MEP_SUPERVISOR:
      DashboardComponent = MEPSupervisorDashboard;
      break;

    case UserRole.ESTIMATION:
      DashboardComponent = EstimationDashboard;
      break;

    case UserRole.ACCOUNTS:
      DashboardComponent = AccountsDashboard;
      break;

    case UserRole.DESIGN:
      DashboardComponent = DesignDashboard;
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