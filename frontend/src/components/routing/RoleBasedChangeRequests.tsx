import React, { lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

const TDChangeRequestsPage = lazy(() => import('@/roles/technical-director/pages/ChangeRequestsPage'));
const EstimatorChangeRequestsPage = lazy(() => import('@/roles/estimator/pages/ChangeRequestsPage'));
const PMChangeRequestsPage = lazy(() => import('@/roles/project-manager/pages/ChangeRequestsPage'));
const SEExtraMaterialPage = lazy(() => import('@/roles/site-engineer/pages/ExtraMaterialPage'));
const PMExtraMaterialPage = lazy(() => import('@/roles/project-manager/pages/ExtraMaterialPage'));

const RoleBasedChangeRequests: React.FC = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  const userRole = (user as any)?.role || '';
  const userRoleLower = userRole.toLowerCase();

  // Check if we're on extra-material route
  const isExtraMaterial = location.pathname.includes('extra-material');

  console.log('[RoleBasedChangeRequests] User role:', userRole, 'Path:', location.pathname, 'Is Extra Material:', isExtraMaterial);

  // Determine which component to render based on role and route
  let Component;

  if (isExtraMaterial) {
    // Extra Material routing
    if (userRoleLower === 'site engineer' || userRoleLower === 'site_engineer' ||
        userRoleLower === 'siteengineer' || userRole === 'siteEngineer') {
      Component = SEExtraMaterialPage;
    } else if (userRoleLower === 'project manager' || userRoleLower === 'project_manager' ||
               userRoleLower === 'projectmanager' || userRole === 'projectManager') {
      Component = PMExtraMaterialPage;
    } else {
      // Other roles don't have access to extra material
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
            <div className="mb-4">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-600">
              Extra Material is not available for your role.
            </p>
          </div>
        </div>
      );
    }
  } else {
    // Change Requests routing
    if (userRoleLower === 'technical director' || userRoleLower === 'technical_director' ||
        userRoleLower === 'technicaldirector' || userRole === 'technicalDirector') {
      Component = TDChangeRequestsPage;
    } else if (userRoleLower === 'estimator') {
      Component = EstimatorChangeRequestsPage;
    } else if (userRoleLower === 'project manager' || userRoleLower === 'project_manager' ||
               userRoleLower === 'projectmanager' || userRole === 'projectManager') {
      Component = PMChangeRequestsPage;
    } else {
      // Default to showing access denied message
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
            <div className="mb-4">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-600">
              Change Requests is not available for your role.
            </p>
          </div>
        </div>
      );
    }
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <ModernLoadingSpinners variant="pulse" color="blue" />
      </div>
    }>
      <Component />
    </Suspense>
  );
};

export default RoleBasedChangeRequests;
