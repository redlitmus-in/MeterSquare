import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/store/authStore';
import { useAdminViewStore } from '@/store/adminViewStore';
import { UserRole } from '@/types';
import { validateSupabaseConnection } from '@/utils/environment';
import { setupCacheValidator, clearApiCaches } from '@/utils/clearCache';
import { queryClient } from '@/lib/queryClient';
import { setupRealtimeSubscriptions } from '@/lib/realtimeSubscriptions';
import { initializeNotificationService } from '@/store/notificationStore';
import { realtimeNotificationHub } from '@/services/realtimeNotificationHub';
// NOTE: backgroundNotificationService removed - realtimeNotificationHub handles everything
import { Security } from '@/utils/security'; // Initialize security system
// NOTE: LazyMotion not used - would require updating 89 files from 'motion' to 'm' component

// Load notification debugger and desktop notification tester in development
if (import.meta.env.DEV) {
  import('@/utils/notificationDebugger');
  import('@/utils/testDesktopNotifications');
}

// Critical components loaded immediately
import { LoginPage } from '@/pages/auth/LoginPage';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import RoleBasedRedirect from '@/components/routing/RoleBasedRedirect';
import NotificationSystem from '@/components/NotificationSystem';
import NavigationListener from '@/components/NavigationListener';

// Lazy load all non-critical pages
const TasksPage = lazy(() => import('@/pages/common/TasksPage'));
const ProjectsPage = lazy(() => import('@/pages/common/ProjectsPage'));
const ProcessFlowPage = lazy(() => import('@/pages/common/ProcessFlowPage'));
const ProfilePage = lazy(() => import('@/pages/common/ProfilePage'));
const WorkflowStatusPage = lazy(() => import('@/pages/common/WorkflowStatusPage'));
const NotificationsPage = lazy(() => import('@/pages/common/NotificationsPage'));
const CreativeErrorPage = lazy(() => import('@/components/ui/CreativeErrorPage'));

// Lazy load procurement pages - Temporarily commented out
// const ProcurementHub = lazy(() => import('@/roles/procurement/pages/ProcurementHub'));
// const DeliveriesPage = lazy(() => import('@/roles/procurement/pages/DeliveriesPage'));

// Vendor management pages removed - now handled by role-specific pages

// Lazy load role hubs - Direct import for better code splitting
const ProjectManagerHub = lazy(() => import('@/roles/project-manager/pages/ProjectManagerHub'));
const MEPDashboard = lazy(() => import('@/roles/mep/pages/MEPDashboard'));
// const EstimationHub = lazy(() => import('@/roles/estimation/pages/EstimationHub'));
const EstimatorHub = lazy(() => import('@/roles/estimator/pages/EstimatorHub'));
const TechnicalDirectorHub = lazy(() => import('@/roles/technical-director/pages/TechnicalDirectorHub'));
// const MEPSupervisorHub = lazy(() => import('@/roles/mep-supervisor/pages/MEPSupervisorHub'));
// const AccountsHub = lazy(() => import('@/roles/accounts/pages/AccountsHub'));

// Technical Director Pages
const ProjectApprovals = lazy(() => import('@/roles/technical-director/pages/ProjectApprovals'));
const DisposalApprovals = lazy(() => import('@/roles/technical-director/pages/DisposalApprovals'));
const AssetDisposalApprovals = lazy(() => import('@/roles/technical-director/pages/AssetDisposalApprovals'));
const ChangeRequestsPage = lazy(() => import('@/roles/technical-director/pages/ChangeRequestsPage'));
const PurchaseComparison = lazy(() => import('@/roles/technical-director/pages/PurchaseComparison'));

// Project Manager Pages
const MyProjects = lazy(() => import('@/roles/project-manager/pages/MyProjects'));
const RecordMaterialPurchase = lazy(() => import('@/roles/project-manager/pages/RecordMaterialPurchase'));
const RecordLabourHours = lazy(() => import('@/roles/project-manager/pages/RecordLabourHours'));
const AssetRequisitionApprovals = lazy(() => import('@/roles/project-manager/pages/AssetRequisitionApprovals'));

// Role-based Change Requests
const RoleBasedChangeRequests = lazy(() => import('@/components/routing/RoleBasedChangeRequests'));

// Site Engineer Pages
const SiteEngineerProjects = lazy(() => import('@/roles/site-engineer/pages/MyProjects'));
const SiteAssets = lazy(() => import('@/roles/site-engineer/pages/SiteAssets'));
const MaterialReceipts = lazy(() => import('@/roles/site-engineer/pages/MaterialReceipts'));

// Buyer Pages
const MaterialsToPurchase = lazy(() => import('@/roles/buyer/pages/MaterialsToPurchase'));
const PurchaseOrders = lazy(() => import('@/roles/buyer/pages/PurchaseOrders'));
const VendorManagement = lazy(() => import('@/roles/buyer/pages/VendorManagement'));
const VendorDetails = lazy(() => import('@/roles/buyer/pages/VendorDetails'));
const BuyerStore = lazy(() => import('@/roles/buyer/pages/Store'));
const MaterialTransfer = lazy(() => import('@/roles/buyer/pages/MaterialTransfer'));

// Production Manager Pages - M2 Store Management
const ProductionManagerDashboard = lazy(() => import('@/roles/production-manager/pages/ProductionManagerDashboard'));
const M2StoreLanding = lazy(() => import('@/roles/production-manager/pages/M2StoreLanding'));
const MaterialsManagement = lazy(() => import('@/roles/production-manager/pages/MaterialsManagement'));
const ReceiveStock = lazy(() => import('@/roles/production-manager/pages/ReceiveStock'));
const DispatchMaterials = lazy(() => import('@/roles/production-manager/pages/DispatchMaterials'));
const MaterialsCatalogPage = lazy(() => import('@/roles/production-manager/pages/MaterialsCatalogPage'));
const StockOutPage = lazy(() => import('@/roles/production-manager/pages/StockOutPage'));
const StockInPage = lazy(() => import('@/roles/production-manager/pages/StockInPage'));
const ReturnableAssets = lazy(() => import('@/roles/production-manager/pages/ReturnableAssets'));
const AssetStockIn = lazy(() => import('@/roles/production-manager/pages/AssetStockIn'));
const AssetDispatch = lazy(() => import('@/roles/production-manager/pages/AssetDispatch'));
const AssetReceiveReturns = lazy(() => import('@/roles/production-manager/pages/AssetReceiveReturns'));
const ReceiveReturns = lazy(() => import('@/roles/production-manager/pages/ReceiveReturns'));
const RepairManagement = lazy(() => import('@/roles/production-manager/pages/RepairManagement'));
const AssetRepairManagement = lazy(() => import('@/roles/production-manager/pages/AssetRepairManagement'));
const MaterialDisposalPage = lazy(() => import('@/roles/production-manager/pages/MaterialDisposalPage'));
const AssetDisposalPage = lazy(() => import('@/roles/production-manager/pages/AssetDisposalPage'));

// Admin Pages - Mix of custom admin pages and role pages
const AdminUserManagement = lazy(() => import('@/pages/admin/UserManagement'));
const AdminRoleManagement = lazy(() => import('@/pages/admin/RoleManagement'));
const AdminBOQManagement = lazy(() => import('@/pages/admin/BOQManagement'));
const AdminSettings = lazy(() => import('@/pages/admin/Settings'));
const AdminSignatureUpload = lazy(() => import('@/pages/admin/SignatureUpload'));
const AdminMyProjects = lazy(() => import('@/pages/admin/AdminMyProjects'));
const AdminSEProjects = lazy(() => import('@/pages/admin/AdminSEProjects'));

// Labour Management Pages
const LabourRegistry = lazy(() => import('@/pages/labour/LabourRegistry'));
const LabourRequisition = lazy(() => import('@/pages/labour/LabourRequisition'));
const RequisitionApprovals = lazy(() => import('@/pages/labour/RequisitionApprovals'));
const WorkerAssignments = lazy(() => import('@/pages/labour/WorkerAssignments'));
const ArrivalConfirmation = lazy(() => import('@/pages/labour/ArrivalConfirmation'));
const AttendanceLogs = lazy(() => import('@/pages/labour/AttendanceLogs'));
const AttendanceLock = lazy(() => import('@/pages/labour/AttendanceLock'));
const PayrollProcessing = lazy(() => import('@/pages/labour/PayrollProcessing'));
// Support Pages (for dev team - not client admin)
const AdminSupportManagement = lazy(() => import('@/pages/support/SupportManagement'));
const PublicSupportPage = lazy(() => import('@/pages/support/PublicSupportPage'));

// Lazy load workflow pages
const MaterialDispatchProductionPage = lazy(() => import('@/pages/workflows/MaterialDispatchProductionPage'));
const MaterialDispatchSitePage = lazy(() => import('@/pages/workflows/MaterialDispatchSitePage'));

// Lazy load role-specific vendor management pages - Temporarily commented out
// const PMVendorManagement = lazy(() => import('@/roles/project-manager/pages/PMVendorManagement'));
// const ProcurementVendorReview = lazy(() => import('@/roles/procurement/pages/ProcurementVendorReview'));
// const EstimationVendorCheck = lazy(() => import('@/roles/estimation/pages/EstimationVendorCheck'));
// const TDVendorApproval - REMOVED - replaced by ChangeRequestsPage
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
  const { viewingAsRole } = useAdminViewStore();

  // Get user role (backend sends camelCase: technicalDirector)
  let userRole = (user as any)?.role || '';

  // If admin is viewing as another role, use that role instead
  const isAdmin = userRole?.toLowerCase() === 'admin';
  if (isAdmin && viewingAsRole && viewingAsRole !== 'admin') {
    userRole = viewingAsRole;
  }

  const userRoleLower = userRole.toLowerCase();

  // Check if user is MEP Supervisor - use MEPDashboard
  if (userRoleLower === 'mep' || userRoleLower === 'mep supervisor' || userRoleLower === 'mep_supervisor') {
    return <MEPDashboard />;
  }

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
  const { viewingAsRole } = useAdminViewStore();

  let userRole = (user as any)?.role || '';

  // If admin is viewing as another role, use that role instead
  const isAdmin = userRole?.toLowerCase() === 'admin';
  if (isAdmin && viewingAsRole && viewingAsRole !== 'admin') {
    userRole = viewingAsRole;
  }

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
  const { viewingAsRole } = useAdminViewStore();

  // Get user role (backend sends camelCase: technicalDirector)
  let userRole = (user as any)?.role || '';

  // If admin is viewing as another role, use that role instead
  const isAdmin = userRole?.toLowerCase() === 'admin';
  if (isAdmin && viewingAsRole && viewingAsRole !== 'admin') {
    userRole = viewingAsRole;
  }

  const userRoleLower = userRole.toLowerCase();
  const roleId = user?.role_id;
  const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

  // Check if user is Buyer
  const isBuyer = roleId === 'buyer' ||
                  roleIdLower === 'buyer' ||
                  userRoleLower === 'buyer';

  // Check if user is Technical Director
  const isTechnicalDirector = userRole === 'Technical Director' ||
                             userRole === 'technicalDirector' ||
                             userRoleLower === 'technical director' ||
                             userRoleLower === 'technical_director' ||
                             userRoleLower === 'technicaldirector' ||
                             roleId === UserRole.TECHNICAL_DIRECTOR ||
                             roleId === 'technicalDirector' ||
                             roleIdLower === 'technical_director';

  // Buyer, Technical Director, and Admin have vendor management access
  if (isBuyer || isTechnicalDirector || isAdmin) {
    return <VendorManagement />;
  }

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
            Vendor management is not available for {userRoleLower === 'site supervisor' || userRoleLower === 'site_supervisor' || userRoleLower === 'sitesupervisor' ? 'Site Supervisor' : 'MEP Manager'} role.
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

// Role-specific Vendor Details Component
const RoleSpecificVendorDetails: React.FC = () => {
  const { user } = useAuthStore();
  const { viewingAsRole } = useAdminViewStore();

  // Get user role (backend sends camelCase: technicalDirector)
  let userRole = (user as any)?.role || '';

  // If admin is viewing as another role, use that role instead
  const isAdmin = userRole?.toLowerCase() === 'admin';
  if (isAdmin && viewingAsRole && viewingAsRole !== 'admin') {
    userRole = viewingAsRole;
  }

  const userRoleLower = userRole.toLowerCase();
  const roleId = user?.role_id;
  const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

  // Check if user is Buyer
  const isBuyer = roleId === 'buyer' ||
                  roleIdLower === 'buyer' ||
                  userRoleLower === 'buyer';

  // Check if user is Technical Director
  const isTechnicalDirector = userRole === 'Technical Director' ||
                             userRole === 'technicalDirector' ||
                             userRoleLower === 'technical director' ||
                             userRoleLower === 'technical_director' ||
                             userRoleLower === 'technicaldirector' ||
                             roleId === UserRole.TECHNICAL_DIRECTOR ||
                             roleId === 'technicalDirector' ||
                             roleIdLower === 'technical_director';

  // Buyer, Technical Director, and Admin have vendor details access
  if (isBuyer || isTechnicalDirector || isAdmin) {
    return <VendorDetails />;
  }

  // For any other roles, show no access message
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <div className="mb-4">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h3>
        <p className="text-gray-600">
          Your role does not have access to vendor details.
        </p>
      </div>
    </div>
  );
};

// Role-specific Materials Component
const RoleSpecificMaterials: React.FC = () => {
  const { user } = useAuthStore();
  const { viewingAsRole } = useAdminViewStore();

  let userRole = (user as any)?.role || '';
  const isAdmin = userRole?.toLowerCase() === 'admin';
  if (isAdmin && viewingAsRole && viewingAsRole !== 'admin') {
    userRole = viewingAsRole;
  }

  const userRoleLower = userRole.toLowerCase();
  const roleId = user?.role_id;
  const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

  const isBuyer = roleId === 'buyer' || roleIdLower === 'buyer' || userRoleLower === 'buyer';
  const isTechnicalDirector = userRole === 'Technical Director' ||
                             userRole === 'technicalDirector' ||
                             userRoleLower === 'technical director' ||
                             userRoleLower === 'technical_director' ||
                             userRoleLower === 'technicaldirector' ||
                             roleId === UserRole.TECHNICAL_DIRECTOR ||
                             roleId === 'technicalDirector' ||
                             roleIdLower === 'technical_director';

  if (isBuyer || isTechnicalDirector || isAdmin) {
    return <MaterialsToPurchase />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <div className="mb-4">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h3>
        <p className="text-gray-600">
          Your role does not have access to materials management.
        </p>
      </div>
    </div>
  );
};

// Role-specific Purchase Orders Component
const RoleSpecificPurchaseOrders: React.FC = () => {
  const { user } = useAuthStore();
  const { viewingAsRole } = useAdminViewStore();

  let userRole = (user as any)?.role || '';
  const isAdmin = userRole?.toLowerCase() === 'admin';
  if (isAdmin && viewingAsRole && viewingAsRole !== 'admin') {
    userRole = viewingAsRole;
  }

  const userRoleLower = userRole.toLowerCase();
  const roleId = user?.role_id;
  const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

  const isBuyer = roleId === 'buyer' || roleIdLower === 'buyer' || userRoleLower === 'buyer';
  const isTechnicalDirector = userRole === 'Technical Director' ||
                             userRole === 'technicalDirector' ||
                             userRoleLower === 'technical director' ||
                             userRoleLower === 'technical_director' ||
                             userRoleLower === 'technicaldirector' ||
                             roleId === UserRole.TECHNICAL_DIRECTOR ||
                             roleId === 'technicalDirector' ||
                             roleIdLower === 'technical_director';

  // TD gets their own dedicated page (ChangeRequestsPage with Vendor Approvals tab)
  // This includes Admin viewing as TD
  if (isTechnicalDirector) {
    return <ChangeRequestsPage />;
  }

  // Buyer gets the buyer purchase orders page
  // Admin without viewingAsRole also gets the buyer page (default admin view)
  if (isBuyer || (isAdmin && !viewingAsRole)) {
    return <PurchaseOrders />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <div className="mb-4">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h3>
        <p className="text-gray-600">
          Your role does not have access to purchase orders.
        </p>
      </div>
    </div>
  );
};

// Role-specific Store Component
const RoleSpecificStore: React.FC = () => {
  const { user } = useAuthStore();
  const { viewingAsRole } = useAdminViewStore();

  let userRole = (user as any)?.role || '';
  const isAdmin = userRole?.toLowerCase() === 'admin';
  if (isAdmin && viewingAsRole && viewingAsRole !== 'admin') {
    userRole = viewingAsRole;
  }

  const userRoleLower = userRole.toLowerCase();
  const roleId = user?.role_id;
  const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

  const isBuyer = roleId === 'buyer' || roleIdLower === 'buyer' || userRoleLower === 'buyer';

  if (isBuyer || isAdmin) {
    return <BuyerStore />;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-md max-w-md">
        <div className="mb-4">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h3>
        <p className="text-gray-600">
          Your role does not have access to the store.
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

// Project Manager, MEP Manager, Technical Director, and Admin Route Component
const ProjectManagerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();

  // Get role from user object (backend sends 'role' field with role name)
  const userRole = (user as any)?.role || '';
  const userRoleLower = typeof userRole === 'string' ? userRole.toLowerCase() : '';

  // Also check role_id for compatibility
  const roleId = user?.role_id;
  const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

  // Allow Project Manager, MEP, Technical Director, and Admin (check multiple format variations)
  const isProjectManager = userRole === 'Project Manager' ||
                          userRoleLower === 'project manager' ||
                          userRoleLower === 'project_manager' ||
                          userRoleLower === 'projectmanager' ||
                          roleId === UserRole.PROJECT_MANAGER ||
                          roleId === 'projectManager' ||
                          roleIdLower === 'project_manager';

  // MEP Manager (management level) - same access as PM
  const isMEP = userRole === 'MEP' ||
                userRole === 'MEP Manager' ||
                userRoleLower === 'mep' ||
                userRoleLower === 'mep supervisor' ||
                userRoleLower === 'mep_supervisor' ||
                roleId === UserRole.MEP ||
                roleId === 'mep' ||
                roleIdLower === 'mep';

  const isTechnicalDirector = userRole === 'Technical Director' ||
                             userRoleLower === 'technical director' ||
                             userRoleLower === 'technical_director' ||
                             userRoleLower === 'technicaldirector' ||
                             roleId === UserRole.TECHNICAL_DIRECTOR ||
                             roleId === 'technicalDirector' ||
                             roleIdLower === 'technical_director';

  const isAdmin = userRole === 'Admin' ||
                 userRoleLower === 'admin' ||
                 roleId === 'admin' ||
                 roleIdLower === 'admin' ||
                 roleId?.toString().toLowerCase() === 'admin';

  if (!isProjectManager && !isMEP && !isTechnicalDirector && !isAdmin) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};

// PM Only Route - Excludes MEP (for Labour routes that are PM-specific)
// MEP does NOT deal with labour requisitions - those go to the assigned PM
const PMOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, getRoleDashboard } = useAuthStore();

  const userRole = (user as any)?.role || '';
  const userRoleLower = typeof userRole === 'string' ? userRole.toLowerCase() : '';
  const roleId = user?.role_id;
  const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

  // Check if MEP - redirect to dashboard
  const isMEP = userRole === 'MEP' ||
                userRole === 'MEP Manager' ||
                userRoleLower === 'mep' ||
                userRoleLower === 'mep supervisor' ||
                userRoleLower === 'mep_supervisor' ||
                roleId === UserRole.MEP ||
                roleId === 'mep' ||
                roleIdLower === 'mep';

  // If MEP, redirect to their dashboard (they don't have access to labour routes)
  if (isMEP) {
    return <Navigate to={getRoleDashboard()} replace />;
  }

  // Allow Project Manager and Admin only
  const isProjectManager = userRole === 'Project Manager' ||
                          userRoleLower === 'project manager' ||
                          userRoleLower === 'project_manager' ||
                          userRoleLower === 'projectmanager' ||
                          roleId === UserRole.PROJECT_MANAGER ||
                          roleId === 'projectManager' ||
                          roleIdLower === 'project_manager';

  const isAdmin = userRole === 'Admin' ||
                 userRoleLower === 'admin' ||
                 roleId === 'admin' ||
                 roleIdLower === 'admin' ||
                 roleId?.toString().toLowerCase() === 'admin';

  if (!isProjectManager && !isAdmin) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};

// Technical Director and Admin Route Component
const TechnicalDirectorRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();
  const userRole = (user as any)?.role || '';
  const userRoleLower = typeof userRole === 'string' ? userRole.toLowerCase() : '';
  const roleId = user?.role_id;
  const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

  const isTechnicalDirector = userRole === 'Technical Director' ||
                             userRoleLower === 'technical director' ||
                             userRoleLower === 'technical_director' ||
                             userRoleLower === 'technicaldirector' ||
                             roleId === UserRole.TECHNICAL_DIRECTOR ||
                             roleId === 'technicalDirector' ||
                             roleIdLower === 'technical_director';

  const isAdmin = userRole === 'Admin' ||
                 userRoleLower === 'admin' ||
                 roleId === 'admin' ||
                 roleIdLower === 'admin';

  if (!isTechnicalDirector && !isAdmin) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};

// Estimator and Admin Route Component
const EstimatorRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();
  const userRole = (user as any)?.role || '';
  const userRoleLower = typeof userRole === 'string' ? userRole.toLowerCase() : '';
  const roleId = user?.role_id;
  const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

  const isEstimator = userRoleLower === 'estimator' ||
                     userRoleLower === 'estimation' ||
                     roleId === 'estimator' ||
                     roleIdLower === 'estimator';

  const isAdmin = userRole === 'Admin' ||
                 userRoleLower === 'admin' ||
                 roleId === 'admin' ||
                 roleIdLower === 'admin';

  if (!isEstimator && !isAdmin) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};

// Site Engineer and Admin Route Component
const SiteEngineerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();
  const userRole = (user as any)?.role || '';
  const userRoleLower = typeof userRole === 'string' ? userRole.toLowerCase() : '';
  const roleId = user?.role_id;
  const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

  const isSiteEngineer = userRoleLower === 'siteengineer' ||
                        userRoleLower === 'site engineer' ||
                        userRoleLower === 'site_engineer' ||
                        userRoleLower === 'sitesupervisor' ||
                        userRoleLower === 'site supervisor' ||
                        userRoleLower === 'site_supervisor' ||
                        roleId === 'siteEngineer' ||
                        roleIdLower === 'site_engineer';

  const isAdmin = userRole === 'Admin' ||
                 userRoleLower === 'admin' ||
                 roleId === 'admin' ||
                 roleIdLower === 'admin';

  if (!isSiteEngineer && !isAdmin) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};

// Buyer and Admin Route Component
const BuyerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();

  // If user is logged in, allow access - backend will handle authorization
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Production Manager and Admin Route Component
const ProductionManagerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();
  const userRole = (user as any)?.role || '';
  const userRoleLower = typeof userRole === 'string' ? userRole.toLowerCase() : '';
  const roleId = user?.role_id;
  const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

  const isProductionManager = userRoleLower === 'productionmanager' ||
                             userRoleLower === 'production manager' ||
                             userRoleLower === 'production_manager' ||
                             roleId === 'productionManager' ||
                             roleIdLower === 'production_manager';

  const isAdmin = userRole === 'Admin' ||
                 userRoleLower === 'admin' ||
                 roleId === 'admin' ||
                 roleIdLower === 'admin';

  if (!isProductionManager && !isAdmin) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};

// Labour Requisition Route - For SE and PM (both can create requisitions)
const LabourRequisitionRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();
  const userRole = (user as any)?.role || '';
  const userRoleLower = typeof userRole === 'string' ? userRole.toLowerCase() : '';

  // Allow Site Engineer, Project Manager, MEP, Technical Director, and Admin
  const isAuthorized =
    userRoleLower === 'site engineer' ||
    userRoleLower === 'siteengineer' ||
    userRoleLower === 'site_engineer' ||
    userRoleLower === 'project manager' ||
    userRoleLower === 'projectmanager' ||
    userRoleLower === 'project_manager' ||
    userRoleLower === 'mep' ||
    userRoleLower === 'mep manager' ||
    userRoleLower === 'technical director' ||
    userRoleLower === 'technicaldirector' ||
    userRoleLower === 'admin';

  if (!isAuthorized) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};

// Admin Only Route Component
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();

  // Get role from user object
  const userRole = (user as any)?.role || '';
  const userRoleLower = typeof userRole === 'string' ? userRole.toLowerCase() : '';

  // Also check role_id for compatibility
  const roleId = user?.role_id;
  const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

  // Check if user is Admin
  const isAdmin = userRole === 'Admin' ||
                 userRoleLower === 'admin' ||
                 roleId === 'admin' ||
                 roleIdLower === 'admin' ||
                 roleId?.toString().toLowerCase() === 'admin';

  if (!isAdmin) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};

function App() {
  const { getCurrentUser, isAuthenticated, logout, user } = useAuthStore();
  const [isEnvironmentValid, setIsEnvironmentValid] = useState<boolean | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Setup real-time subscriptions when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      const userRole = (user as any)?.role || '';

      // Only setup subscriptions once - don't recreate on every user object change
      const currentSubs = setupRealtimeSubscriptions(userRole);

      // Reconnect real-time hub with new credentials (handles all notification services)
      realtimeNotificationHub.reconnect();

      // Request desktop notification permission on login
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }

      // Fetch missed notifications on app mount/login
      // This ensures notifications show even if user was offline when they were sent
      setTimeout(() => {
        realtimeNotificationHub.fetchMissedNotifications();
      }, 1000); // Small delay to ensure Socket.IO is connected first

      // ONLY cleanup on actual logout (isAuthenticated changes to false)
      return () => {
        // Don't cleanup if user is still authenticated (prevents killing subscriptions on page navigation)
        const stillAuthenticated = localStorage.getItem('access_token');
        if (!stillAuthenticated) {
          if (import.meta.env.DEV) {
            console.log('🔌 User logged out - cleaning up subscriptions');
          }
          currentSubs();
          realtimeNotificationHub.disconnect();
        }
      };
    }
    // Clear credentials on logout
    realtimeNotificationHub.disconnect();
    return undefined;
  }, [isAuthenticated]); // REMOVED 'user' from dependencies to prevent unnecessary re-runs

  useEffect(() => {
    // Clear all API caches on app load to ensure fresh data
    // This prevents stale data issues after hard refresh
    clearApiCaches();

    // Setup cache validation for role mismatches
    setupCacheValidator();

    // Initialize notification services
    initializeNotificationService();

    if (import.meta.env.DEV) {
      console.log('Notification services initialized');
    }

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
              if (import.meta.env.DEV) {
                console.log('Token validation failed, cleaning up...');
              }
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
        {/* NavigationListener enables SPA navigation from non-React services */}
        <NavigationListener />
        {/* NotificationSystem is rendered in DashboardLayout with proper positioning */}
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

        {/* Public Support Page - Temporarily disabled, use logged-in route instead */}
        {/* <Route path="/support-public" element={<PublicSupportPage />} /> */}

        {/* Support Management - For dev team to review tickets (outside client routes) */}
        <Route path="/support-management" element={<AdminSupportManagement />} />

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
            <Route path="boq-management" element={
              <EstimatorRoute>
                <EstimatorHub />
              </EstimatorRoute>
            } />

            {/* Buyer & Technical Director Routes - Role-specific access */}
            <Route path="materials" element={<RoleSpecificMaterials />} />
            <Route path="purchase-orders" element={<RoleSpecificPurchaseOrders />} />
            <Route path="store" element={<RoleSpecificStore />} />
            <Route path="material-transfer" element={
              <BuyerRoute>
                <MaterialTransfer />
              </BuyerRoute>
            } />

            {/* Vendor Management Routes - Role-specific vendor hub */}
            <Route path="vendors" element={<RoleSpecificVendorHub />} />
            <Route path="vendors/:vendorId" element={<RoleSpecificVendorDetails />} />
            <Route path="vendor-management" element={<RoleSpecificVendorHub />} />

            {/* Vendor Form Routes - Temporarily commented out */}
            {/* <Route path="vendors/scope-of-work" element={<VendorScopeOfWorkForm />} /> */}

            {/* Procurement-specific vendor routes - Temporarily commented out */}
            {/* <Route path="vendor-sow-review" element={<ProcurementVendorReview />} /> */}
            {/* <Route path="vendor-quotations" element={<ProcurementVendorReview />} /> */}

            {/* <Route path="mep-supervisor" element={<MEPSupervisorHub />} /> */}
            <Route path="tasks" element={<TasksPage />} />
            <Route path="process-flow" element={<ProcessFlowPage />} />
            <Route path="workflow-status" element={<WorkflowStatusPage />} />
            <Route path="workflows/material-dispatch-production" element={<MaterialDispatchProductionPage />} />
            <Route path="workflows/material-dispatch-site" element={<MaterialDispatchSitePage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="support" element={<PublicSupportPage />} />

            {/* Technical Director Routes */}
            <Route path="project-approvals" element={
              <TechnicalDirectorRoute>
                <ProjectApprovals />
              </TechnicalDirectorRoute>
            } />
            <Route path="disposal-approvals" element={
              <TechnicalDirectorRoute>
                <DisposalApprovals />
              </TechnicalDirectorRoute>
            } />
            <Route path="asset-disposal-approvals" element={
              <TechnicalDirectorRoute>
                <AssetDisposalApprovals />
              </TechnicalDirectorRoute>
            } />
            <Route path="purchase-comparison" element={
              <TechnicalDirectorRoute>
                <PurchaseComparison />
              </TechnicalDirectorRoute>
            } />
            {/* purchase-orders route moved to general routes (line 916 - RoleSpecificPurchaseOrders) */}
            {/* vendor-approval route REMOVED - old page replaced by ChangeRequestsPage */}
            {/* team-assignment route REMOVED - not needed */}
            {/* projects-overview route REMOVED - not needed */}
            {/* Technical Director materials, purchase-orders, and vendor routes moved to general routes above (lines 826-832) */}
            {/* <Route path="materials" element={
              <TechnicalDirectorRoute>
                <MaterialsToPurchase />
              </TechnicalDirectorRoute>
            } />
            <Route path="purchase-orders" element={
              <TechnicalDirectorRoute>
                <PurchaseOrders />
              </TechnicalDirectorRoute>
            } /> */}
            {/* <Route path="vendors" element={
              <TechnicalDirectorRoute>
                <VendorManagement />
              </TechnicalDirectorRoute>
            } />
            <Route path="vendors/:vendorId" element={
              <TechnicalDirectorRoute>
                <VendorDetails />
              </TechnicalDirectorRoute>
            } /> */}

            {/* Project Manager specific routes */}
            <Route path="my-projects" element={
              <ProjectManagerRoute>
                <MyProjects />
              </ProjectManagerRoute>
            } />
            <Route path="record-material" element={
              <ProjectManagerRoute>
                <RecordMaterialPurchase />
              </ProjectManagerRoute>
            } />
            <Route path="record-labour" element={
              <ProjectManagerRoute>
                <RecordLabourHours />
              </ProjectManagerRoute>
            } />
            <Route path="asset-requisition-approvals" element={
              <ProjectManagerRoute>
                <AssetRequisitionApprovals />
              </ProjectManagerRoute>
            } />

            {/* Role-based Change Requests and Extra Material - Single route for all roles */}
            <Route path="change-requests" element={<RoleBasedChangeRequests />} />
            <Route path="extra-material" element={<RoleBasedChangeRequests />} />

            {/* Site Engineer Routes */}
            <Route path="site-assets" element={
              <SiteEngineerRoute>
                <SiteAssets />
              </SiteEngineerRoute>
            } />
            <Route path="material-receipts" element={
              <SiteEngineerRoute>
                <MaterialReceipts />
              </SiteEngineerRoute>
            } />

            {/* Labour Management Routes - Site Engineer & Project Manager (Steps 2, 5, 6) */}
            {/* SE: Create requisitions for PM approval */}
            {/* PM: Create requisitions that go directly to Production */}
            <Route path="labour/requisitions" element={
              <LabourRequisitionRoute>
                <LabourRequisition />
              </LabourRequisitionRoute>
            } />
            <Route path="labour/arrivals" element={
              <SiteEngineerRoute>
                <ArrivalConfirmation />
              </SiteEngineerRoute>
            } />
            <Route path="labour/attendance" element={
              <SiteEngineerRoute>
                <AttendanceLogs />
              </SiteEngineerRoute>
            } />

            {/* Labour Management Routes - Project Manager & MEP (Steps 3, 7) */}
            {/* Backend filters requisitions to show only from assigned SEs */}
            <Route path="labour/approvals" element={
              <ProjectManagerRoute>
                <RequisitionApprovals />
              </ProjectManagerRoute>
            } />
            <Route path="labour/attendance-lock" element={
              <ProjectManagerRoute>
                <AttendanceLock />
              </ProjectManagerRoute>
            } />

            {/* Labour Management Routes - Production Manager (Steps 1, 4) */}
            <Route path="labour/registry" element={
              <ProductionManagerRoute>
                <LabourRegistry />
              </ProductionManagerRoute>
            } />
            <Route path="labour/assignments" element={
              <ProductionManagerRoute>
                <WorkerAssignments />
              </ProductionManagerRoute>
            } />

            {/* Labour Management Routes - Admin/HR (Step 8) */}
            <Route path="labour/payroll" element={
              <AdminRoute>
                <PayrollProcessing />
              </AdminRoute>
            } />

            {/* Buyer materials, purchase-orders, and vendor routes moved to general routes above (lines 826-832) */}
            {/* <Route path="materials" element={
              <BuyerRoute>
                <MaterialsToPurchase />
              </BuyerRoute>
            } />
            <Route path="purchase-orders" element={
              <BuyerRoute>
                <PurchaseOrders />
              </BuyerRoute>
            } /> */}
            {/* <Route path="vendors" element={
              <BuyerRoute>
                <VendorManagement />
              </BuyerRoute>
            } />
            <Route path="vendors/:vendorId" element={
              <BuyerRoute>
                <VendorDetails />
              </BuyerRoute>
            } /> */}

            {/* Production Manager Routes - M2 Store Management */}
            <Route path="m2-store" element={
              <ProductionManagerRoute>
                <M2StoreLanding />
              </ProductionManagerRoute>
            } />
            {/* New Inventory Management Routes */}
            <Route path="m2-store/materials-catalog" element={
              <ProductionManagerRoute>
                <MaterialsCatalogPage />
              </ProductionManagerRoute>
            } />
            <Route path="m2-store/stock-out" element={
              <ProductionManagerRoute>
                <StockOutPage />
              </ProductionManagerRoute>
            } />
            <Route path="m2-store/stock-in" element={
              <ProductionManagerRoute>
                <StockInPage />
              </ProductionManagerRoute>
            } />
            {/* Redirect old routes */}
            <Route path="m2-store/materials" element={
              <Navigate to="/production-manager/m2-store/materials-catalog" replace />
            } />
            <Route path="m2-store/stock" element={
              <Navigate to="/production-manager/m2-store/materials-catalog" replace />
            } />
            {/* Legacy routes */}
            <Route path="m2-store/receive" element={
              <ProductionManagerRoute>
                <ReceiveStock />
              </ProductionManagerRoute>
            } />
            <Route path="m2-store/dispatch" element={
              <ProductionManagerRoute>
                <DispatchMaterials />
              </ProductionManagerRoute>
            } />
            {/* Returnable Assets - Old page (kept for compatibility) */}
            <Route path="m2-store/returnable-assets-old" element={
              <ProductionManagerRoute>
                <ReturnableAssets />
              </ProductionManagerRoute>
            } />
            {/* Returnable Assets - New DN/RDN Flow */}
            <Route path="returnable-assets" element={<Navigate to="returnable-assets/stock-in" replace />} />
            <Route path="returnable-assets/stock-in" element={
              <ProductionManagerRoute>
                <AssetStockIn />
              </ProductionManagerRoute>
            } />
            <Route path="returnable-assets/dispatch" element={
              <ProductionManagerRoute>
                <AssetDispatch />
              </ProductionManagerRoute>
            } />
            <Route path="returnable-assets/receive-returns" element={
              <ProductionManagerRoute>
                <AssetReceiveReturns />
              </ProductionManagerRoute>
            } />
            <Route path="returnable-assets/catalog" element={
              <ProductionManagerRoute>
                <ReturnableAssets />
              </ProductionManagerRoute>
            } />
            <Route path="m2-store/receive-returns" element={
              <ProductionManagerRoute>
                <ReceiveReturns />
              </ProductionManagerRoute>
            } />
            <Route path="m2-store/repair-management" element={
              <ProductionManagerRoute>
                <RepairManagement />
              </ProductionManagerRoute>
            } />
            <Route path="m2-store/disposal" element={
              <ProductionManagerRoute>
                <MaterialDisposalPage />
              </ProductionManagerRoute>
            } />
            {/* Asset Repair Management */}
            <Route path="returnable-assets/repairs" element={
              <ProductionManagerRoute>
                <AssetRepairManagement />
              </ProductionManagerRoute>
            } />
            <Route path="returnable-assets/disposal" element={
              <ProductionManagerRoute>
                <AssetDisposalPage />
              </ProductionManagerRoute>
            } />

            {/* Admin Routes - Use original role pages directly */}
            <Route path="user-management" element={
              <AdminRoute>
                <AdminUserManagement />
              </AdminRoute>
            } />
            <Route path="pm-projects" element={
              <AdminRoute>
                <AdminMyProjects />
              </AdminRoute>
            } />
            <Route path="se-projects" element={
              <AdminRoute>
                <AdminSEProjects />
              </AdminRoute>
            } />
            <Route path="roles" element={
              <AdminRoute>
                <AdminRoleManagement />
              </AdminRoute>
            } />
            <Route path="boq-management" element={
              <AdminRoute>
                <AdminBOQManagement />
              </AdminRoute>
            } />
            <Route path="project-approvals" element={
              <AdminRoute>
                <ProjectApprovals />
              </AdminRoute>
            } />
            {/* projects-overview route REMOVED - not needed */}
            <Route path="record-material" element={
              <AdminRoute>
                <RecordMaterialPurchase />
              </AdminRoute>
            } />
            <Route path="settings" element={
              <AdminRoute>
                <AdminSettings />
              </AdminRoute>
            } />
            <Route path="signature-upload" element={
              <AdminRoute>
                <AdminSignatureUpload />
              </AdminRoute>
            } />
            <Route path="support-management" element={
              <AdminRoute>
                <AdminSupportManagement />
              </AdminRoute>
            } />
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