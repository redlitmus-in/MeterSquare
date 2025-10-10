import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { validateSupabaseConnection } from '@/utils/environment';
import { setupCacheValidator } from '@/utils/clearCache';
import { queryClient } from '@/lib/queryClient';
import { setupRealtimeSubscriptions } from '@/lib/realtimeSubscriptions';
import { initializeNotificationService } from '@/store/notificationStore';
import { backgroundNotificationService } from '@/services/backgroundNotificationService';
import { realtimeNotificationHub } from '@/services/realtimeNotificationHub';
import { Security } from '@/utils/security'; // Initialize security system

// Critical components loaded immediately
import { LoginPage } from '@/pages/auth/LoginPage';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import RoleBasedRedirect from '@/components/routing/RoleBasedRedirect';

// Lazy load all non-critical pages
const TasksPage = lazy(() => import('@/pages/common/TasksPage'));
const ProjectsPage = lazy(() => import('@/pages/common/ProjectsPage'));
const ProcessFlowPage = lazy(() => import('@/pages/common/ProcessFlowPage'));
const ProfilePage = lazy(() => import('@/pages/common/ProfilePage'));
const AnalyticsPage = lazy(() => import('@/pages/common/AnalyticsPage'));
const WorkflowStatusPage = lazy(() => import('@/pages/common/WorkflowStatusPage'));
const CreativeErrorPage = lazy(() => import('@/components/ui/CreativeErrorPage'));

// Lazy load procurement pages - Temporarily commented out
// const ProcurementHub = lazy(() => import('@/roles/procurement/pages/ProcurementHub'));
// const DeliveriesPage = lazy(() => import('@/roles/procurement/pages/DeliveriesPage'));

// Vendor management pages removed - now handled by role-specific pages

// Lazy load role hubs - Direct import for better code splitting
const ProjectManagerHub = lazy(() => import('@/roles/project-manager/pages/ProjectManagerHub'));
const PurchaseApprovalsPage = lazy(() => import('@/roles/project-manager/pages/PurchaseApprovalsPage'));
const EstimationHub = lazy(() => import('@/roles/estimation/pages/EstimationHub'));
const EstimatorHub = lazy(() => import('@/roles/estimator/pages/EstimatorHub'));
const TechnicalDirectorHub = lazy(() => import('@/roles/technical-director/pages/TechnicalDirectorHub'));
// const MEPSupervisorHub = lazy(() => import('@/roles/mep-supervisor/pages/MEPSupervisorHub'));
// const AccountsHub = lazy(() => import('@/roles/accounts/pages/AccountsHub'));

// Technical Director Pages
const ProjectApprovals = lazy(() => import('@/roles/technical-director/pages/ProjectApprovals'));
const TeamAssignment = lazy(() => import('@/roles/technical-director/pages/TeamAssignment'));
const ProjectsOverview = lazy(() => import('@/roles/technical-director/pages/ProjectsOverview'));

// Project Manager Pages
const MyProjects = lazy(() => import('@/roles/project-manager/pages/MyProjects'));

// Role-based Change Requests
const RoleBasedChangeRequests = lazy(() => import('@/components/routing/RoleBasedChangeRequests'));

// Site Engineer Pages
const SiteEngineerProjects = lazy(() => import('@/roles/site-engineer/pages/MyProjects'));

// Lazy load workflow pages
const MaterialDispatchProductionPage = lazy(() => import('@/pages/workflows/MaterialDispatchProductionPage'));
const MaterialDispatchSitePage = lazy(() => import('@/pages/workflows/MaterialDispatchSitePage'));

// Lazy load role-specific vendor management pages - Temporarily commented out
// const PMVendorManagement = lazy(() => import('@/roles/project-manager/pages/PMVendorManagement'));
// const ProcurementVendorReview = lazy(() => import('@/roles/procurement/pages/ProcurementVendorReview'));
// const EstimationVendorCheck = lazy(() => import('@/roles/estimation/pages/EstimationVendorCheck'));
// const TDVendorApproval = lazy(() => import('@/roles/technical-director/pages/TDVendorApproval'));
// const AccountsVendorPayment = lazy(() => import('@/roles/accounts/pages/AccountsVendorPayment'));

// Vendor forms - Temporarily commented out
// const VendorScopeOfWorkForm = lazy(() => import('@/components/forms/VendorScopeOfWorkForm'));

// Other components
const RoleRouteWrapper = lazy(() => import('@/components/routing/RoleRouteWrapper'));
const RoleDashboard = lazy(() => import('@/components/routing/RoleDashboard'));

// Page loader component
import PageLoader from '@/components/ui/PageLoader';

// Role-specific Procurement Hub Component
const RoleSpecificProcurementHub: React.FC = () => {
  const { user } = useAuthStore();

  // Get user role (backend sends camelCase: technicalDirector)
  const userRole = (user as any)?.role || '';
  const userRoleLower = userRole.toLowerCase();

  console.log('User role from backend:', userRole, 'Lowercase:', userRoleLower);
  // Check if user is Project Manager
  if (userRoleLower === 'project manager' || userRoleLower === 'project_manager' || userRoleLower === 'projectmanager') {
    return <ProjectManagerHub />;
  }

  if (userRoleLower === 'estimator') {
    return <EstimatorHub />;
  }

  if (userRole === 'technicalDirector' || userRoleLower === 'technical director' || userRoleLower === 'technical_director' || userRoleLower === 'technicaldirector') {
    return <TechnicalDirectorHub />;
  }

  // Default: Role doesn't have procurement access
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <div className="mb-4">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Procurement Module</h3>
        <p className="text-gray-600">
          Your role does not have access to procurement features.
        </p>
      </div>
    </div>
  );
};

// Role-specific Projects Component
const RoleSpecificProjects: React.FC = () => {
  const { user } = useAuthStore();
  const userRole = (user as any)?.role || '';
  const userRoleLower = userRole.toLowerCase();

  // Estimator role shows EstimatorHub (Projects & BOQ Management)
  if (userRoleLower === 'estimator' || userRoleLower === 'estimation') {
    return <EstimatorHub />;
  }

  // Site Engineer shows SiteEngineerProjects
  if (userRoleLower === 'siteengineer' || userRoleLower === 'site engineer' || userRoleLower === 'site_engineer') {
    return <SiteEngineerProjects />;
  }

  // Default fallback
  return <SiteEngineerProjects />;
};

// Role-specific Vendor Management Hub Component
const RoleSpecificVendorHub: React.FC = () => {
  const { user } = useAuthStore();

  // Get user role (backend sends camelCase: technicalDirector)
  const userRole = (user as any)?.role || '';
  const userRoleLower = userRole.toLowerCase();

  // Site and MEP Supervisors don't have vendor access - they only handle material purchases
  if (userRole === 'siteSupervisor' || userRoleLower === 'site supervisor' || userRoleLower === 'site_supervisor' || userRoleLower === 'sitesupervisor' ||
      userRole === 'mepSupervisor' || userRoleLower === 'mep supervisor' || userRoleLower === 'mep_supervisor' || userRoleLower === 'mepsupervisor') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h3>
          <p className="text-gray-600">
            Vendor management is not available for {userRoleLower === 'site supervisor' || userRoleLower === 'site_supervisor' || userRoleLower === 'sitesupervisor' ? 'Site Supervisor' : 'MEP Supervisor'} role.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            You can initiate material purchase requests through the Procurement module.
          </p>
        </div>
      </div>
    );
  }

  // For any other unrecognized roles, show no access message
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <div className="mb-4">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Vendor Management</h3>
        <p className="text-gray-600">
          Your role does not have access to vendor management features.
        </p>
      </div>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, getCurrentUser, user } = useAuthStore();
  const token = localStorage.getItem('access_token');

  useEffect(() => {
    // Check token validity when component mounts - but don't block rendering
    if (token && !isAuthenticated && !user) {
      // Try to get current user but don't await - it will update state when ready
      getCurrentUser().catch(() => {
        // Token is invalid, getCurrentUser will handle cleanup
      });
    }
  }, [token, isAuthenticated, user, getCurrentUser]);

  // Quick check - if no token, redirect immediately
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // If we have a token, show the content (auth check happens in background)
  return <>{children}</>;
};

// Public Route Component (redirects if authenticated)
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, getRoleDashboard } = useAuthStore();
  const token = localStorage.getItem('access_token');

  // Redirect to dashboard if authenticated
  if (isAuthenticated && token) {
    const dashboardPath = getRoleDashboard();
    return <Navigate to={dashboardPath} replace />;
  }

  return <>{children}</>
};

function App() {
  const { getCurrentUser, isAuthenticated, logout, user } = useAuthStore();
  const [isEnvironmentValid, setIsEnvironmentValid] = useState<boolean | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Setup real-time subscriptions when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      const userRole = (user as any)?.role || '';
      const unsubscribe = setupRealtimeSubscriptions(userRole);

      // Update background service with credentials
      const token = localStorage.getItem('access_token');
      const userId = (user as any)?.id || (user as any)?.userId;
      backgroundNotificationService.updateCredentials(token, userRole, userId);

      // Reconnect real-time hub with new credentials
      realtimeNotificationHub.reconnect();

      return () => {
        unsubscribe();
      };
    } else {
      // Clear credentials on logout
      backgroundNotificationService.updateCredentials(null, null, null);
      realtimeNotificationHub.disconnect();
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    // Setup cache validation for role mismatches
    setupCacheValidator();

    // Initialize notification services
    initializeNotificationService();

    // Initialize background notification service
    console.log('Initializing background notification service...');

    // Quick initialization - don't block on environment validation
    const initialize = async () => {
      try {
        // Set a SHORT timeout for environment validation to prevent long waits
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ success: true }), 500));
        const validationPromise = validateSupabaseConnection();

        const result = await Promise.race([validationPromise, timeoutPromise]) as { success: boolean };
        const { success } = result;
        setIsEnvironmentValid(success);

        if (success) {
          // Check for existing session on app load - don't wait for it
          const token = localStorage.getItem('access_token');
          if (token && !isAuthenticated) {
            // Fire and forget - don't await
            getCurrentUser().catch(() => {
              console.log('Token validation failed, cleaning up...');
              logout();
            });
          }
        }
      } catch (error) {
        console.error('Environment validation failed:', error);
        setIsEnvironmentValid(true); // Continue anyway
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();
  }, []);

  // Only show loading for initial app load, not environment validation
  if (isInitializing) {
    return null; // Let the HTML loader show
  }

  // Show error if environment is invalid
  if (isEnvironmentValid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md mx-auto text-center p-6 bg-white rounded-lg shadow-lg">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Configuration Error</h1>
          <p className="text-gray-600 mb-6">
            The application cannot start due to missing or invalid environment configuration.
          </p>
          <div className="text-left bg-gray-100 p-4 rounded text-sm">
            <p className="font-semibold mb-2">To fix this issue:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Create a <code className="bg-gray-200 px-1 rounded">.env</code> file in the frontend directory</li>
              <li>Add your Supabase credentials (see <code className="bg-gray-200 px-1 rounded">env.example</code>)</li>
              <li>Restart the development server</li>
            </ol>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-[#243d8a] text-white rounded hover:bg-[#243d8a]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="App">
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            style: {
              marginTop: '80px',
              marginRight: '16px'
            }
          }}
        />
        <Suspense fallback={<PageLoader />}>
          <Routes>
        {/* Public Routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        
        {/* Direct demo page - no auth required */}

        {/* Root redirect to login or dashboard */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <RoleBasedRedirect />
            </ProtectedRoute>
          }
        />

        {/* Protected Routes with Role Prefix */}
        <Route
          path="/:role"
          element={
            <ProtectedRoute>
              <RoleRouteWrapper />
            </ProtectedRoute>
          }
        >
          <Route element={<DashboardLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            
            {/* Main Routes - Use role-based dashboard for main dashboard, role-specific hub for procurement section */}
            <Route path="dashboard" element={<RoleDashboard />} />
            <Route path="procurement" element={
              <RoleSpecificProcurementHub />
            } />

            {/* Role-based Projects Route - Shows different UI based on role */}
            <Route path="projects" element={<RoleSpecificProjects />} />

            {/* Estimator Routes */}
            <Route path="boq-management" element={<EstimatorHub />} />

            {/* Vendor Management Routes - Role-specific vendor hub */}
            <Route path="vendors" element={<RoleSpecificVendorHub />} />
            <Route path="vendor-management" element={<RoleSpecificVendorHub />} />

            {/* Vendor Form Routes - Temporarily commented out */}
            {/* <Route path="vendors/scope-of-work" element={<VendorScopeOfWorkForm />} /> */}

            {/* Procurement-specific vendor routes - Temporarily commented out */}
            {/* <Route path="vendor-sow-review" element={<ProcurementVendorReview />} /> */}
            {/* <Route path="vendor-quotations" element={<ProcurementVendorReview />} /> */}

            <Route path="purchase/:purchaseId" element={<PurchaseApprovalsPage />} />
            {/* <Route path="mep-supervisor" element={<MEPSupervisorHub />} /> */}
            <Route path="tasks" element={<TasksPage />} />
            <Route path="process-flow" element={<ProcessFlowPage />} />
            <Route path="workflow-status" element={<WorkflowStatusPage />} />
            <Route path="workflows/material-dispatch-production" element={<MaterialDispatchProductionPage />} />
            <Route path="workflows/material-dispatch-site" element={<MaterialDispatchSitePage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="profile" element={<ProfilePage />} />

            {/* Technical Director Routes */}
            <Route path="project-approvals" element={<ProjectApprovals />} />
            <Route path="team-assignment" element={<TeamAssignment />} />
            <Route path="projects-overview" element={<ProjectsOverview />} />

            {/* Project Manager specific routes */}
            <Route path="my-projects" element={<MyProjects />} />

            {/* Role-based Change Requests - Single route for all roles */}
            <Route path="change-requests" element={<RoleBasedChangeRequests />} />

            {/* Site Engineer specific routes - Temporarily commented out */}
            {/* <Route path="my-project" element={<MyProject />} /> */}
            {/* <Route path="task-execution" element={<TaskExecution />} /> */}
            {/* <Route path="material-usage" element={<MaterialUsage />} /> */}
            {/* <Route path="report-issue" element={<ReportIssue />} /> */}
          </Route>
        </Route>

        {/* Error Routes */}
        <Route 
          path="/404" 
          element={
            <CreativeErrorPage 
              variant="liquid-motion"
              errorCode="404"
              errorTitle="Page Not Found"
              errorMessage="The page you're looking for doesn't exist or has been moved."
            />
          } 
        />
        <Route 
          path="/403" 
          element={
            <CreativeErrorPage 
              variant="liquid-motion"
              errorCode="403"
              errorTitle="Access Denied"
              errorMessage="You don't have permission to access this resource."
            />
          } 
        />
        <Route 
          path="/500" 
          element={
            <CreativeErrorPage 
              variant="liquid-motion"
              errorCode="500"
              errorTitle="Server Error"
              errorMessage="Something went wrong on our end. Please try again later."
              onRefresh={() => window.location.reload()}
            />
          } 
        />
        
        {/* Catch all route - show 404 error page */}
        <Route 
          path="*" 
          element={
            <CreativeErrorPage 
              variant="liquid-motion"
              errorCode="404"
              errorTitle="Page Not Found"
              errorMessage="The page you're looking for doesn't exist or has been moved."
            />
          } 
        />
      </Routes>
        </Suspense>
      </div>
    </QueryClientProvider>
  );
}

export default App;