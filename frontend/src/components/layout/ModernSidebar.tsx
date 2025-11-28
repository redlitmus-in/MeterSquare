import React, { Fragment, useState, useMemo, useCallback, memo } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XMarkIcon,
  HomeIcon,
  CheckCircleIcon,
  UsersIcon,
  ChartBarIcon,
  UserIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  ShoppingCartIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  BuildingOfficeIcon,
  ClipboardDocumentCheckIcon,
  DocumentCheckIcon,
  DocumentPlusIcon,
  DocumentTextIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  UserGroupIcon,
  Cog6ToothIcon as Settings
} from '@heroicons/react/24/outline';
import {
  HomeIcon as HomeSolid,
  ShoppingCartIcon as ShoppingSolid,
  UsersIcon as UsersSolid,
  ChartBarIcon as ChartSolid,
  DocumentCheckIcon as DocumentCheckSolid,
  DocumentPlusIcon as DocumentPlusSolid,
  DocumentTextIcon as DocumentTextSolid,
  BuildingOfficeIcon as BuildingOfficeSolid,
  ClipboardDocumentCheckIcon as ClipboardDocumentCheckSolid,
  CubeIcon as CubeSolid,
  ExclamationTriangleIcon as ExclamationTriangleSolid,
  UserIcon as UserCheck,
  CheckCircleIcon as CheckCircleSolid
} from '@heroicons/react/24/solid';
import { useAuthStore } from '@/store/authStore';
import { UserRole } from '@/types';
import { getRoleDisplayName, getRoleThemeColor, buildRolePath, getRoleName } from '@/utils/roleRouting';
import { clsx } from 'clsx';
import { siteEngineerService } from '@/roles/site-engineer/services/siteEngineerService';
import { projectManagerService } from '@/roles/project-manager/services/projectManagerService';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import axios from 'axios';
import { useAdminViewStore } from '@/store/adminViewStore';
import { adminApi } from '@/api/admin';

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
  iconSolid: React.ComponentType<any>;
  color?: string;
  children?: NavigationItem[];
}

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

// Memoized Navigation Item Component
const NavigationItemComponent = memo<{
  item: NavigationItem;
  isActive: boolean;
  isCollapsed: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  onToggleSection: (name: string) => void;
  onNavigate: () => void;
}>(({ item, isActive, isCollapsed, isExpanded, hasChildren, onToggleSection, onNavigate }) => {
  const IconComponent = isActive ? item.iconSolid : item.icon;

  if (hasChildren) {
    return (
      <div className="flex items-center">
        <Link
          to={item.href}
          onClick={() => {
            onNavigate();
            if (!isExpanded) {
              onToggleSection(item.name.toLowerCase());
            }
          }}
          title={isCollapsed ? item.name : ''}
          className={clsx(
            'flex-1 group flex items-center transition-colors duration-150 text-xs font-medium rounded-lg',
            isCollapsed ? 'px-2 py-2 justify-center' : 'px-2.5 py-2',
            isActive
              ? item.name === 'Procurement'
                ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-900 shadow-md border border-red-200'
                : item.name === 'Vendor Management'
                ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-900 shadow-md border border-blue-200'
                : 'bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 text-[#243d8a] shadow-md border border-[#243d8a]/20'
              : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
          )}
        >
          <div className="flex items-center">
            <div className={clsx(
              'rounded-md transition-colors duration-150',
              isCollapsed ? 'p-1.5' : 'p-1.5 mr-2',
              isActive
                ? item.name === 'Procurement'
                  ? 'bg-red-500 shadow-lg'
                  : item.name === 'Vendor Management'
                  ? 'bg-blue-500 shadow-lg'
                  : 'bg-[#243d8a] shadow-lg'
                : 'bg-gray-100 group-hover:bg-gray-200'
            )}>
              <IconComponent className={clsx(
                'w-4 h-4 transition-colors duration-150',
                isActive ? 'text-white' : item.color || 'text-gray-500'
              )} />
            </div>
            {!isCollapsed && <span className="font-semibold">{item.name}</span>}
          </div>
        </Link>
        {!isCollapsed && (
          <button
            onClick={() => onToggleSection(item.name.toLowerCase())}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title={`Toggle ${item.name} section`}
            aria-label={`Toggle ${item.name} section`}
          >
            <ChevronRightIcon
              className={clsx(
                'w-4 h-4 transition-transform duration-200',
                isExpanded ? 'transform rotate-90' : '',
                isActive ? 'text-gray-700' : 'text-gray-400'
              )}
            />
          </button>
        )}
      </div>
    );
  }

  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      title={isCollapsed ? item.name : ''}
      className={clsx(
        'group flex items-center transition-colors duration-150 text-xs font-medium rounded-lg relative overflow-hidden',
        isCollapsed ? 'px-2 py-2 justify-center' : 'px-2.5 py-2',
        isActive
          ? item.name === 'Procurement'
            ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-900 shadow-md border border-red-200'
            : item.name === 'Vendor Management'
            ? 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-900 shadow-md border border-blue-200'
            : 'bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 text-[#243d8a] shadow-md border border-[#243d8a]/20'
          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
      )}
    >
      {isActive && (
        <div className={clsx(
          "absolute left-0 top-1/2 transform -translate-y-1/2 w-1 h-8 rounded-r-full",
          item.name === 'Procurement' ? 'bg-red-500' :
          item.name === 'Vendor Management' ? 'bg-blue-500' : 'bg-[#243d8a]'
        )}></div>
      )}
      <div className={clsx(
        'rounded-md transition-colors duration-150',
        isCollapsed ? 'p-1.5' : 'p-1.5 mr-2',
        isActive
          ? item.name === 'Procurement'
            ? 'bg-red-500 shadow-lg'
            : item.name === 'Vendor Management'
            ? 'bg-blue-500 shadow-lg'
            : 'bg-[#243d8a] shadow-lg'
          : 'bg-gray-100 group-hover:bg-gray-200'
      )}>
        <IconComponent className={clsx(
          'w-4 h-4 transition-colors duration-150',
          isActive ? 'text-white' : item.color || 'text-gray-500'
        )} />
      </div>
      {!isCollapsed && <span className="font-semibold">{item.name}</span>}
      <div className={clsx(
        "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl",
        item.name === 'Procurement'
          ? 'bg-gradient-to-r from-red-500/5 to-red-500/10'
          : item.name === 'Vendor Management'
          ? 'bg-gradient-to-r from-blue-500/5 to-blue-500/10'
          : 'bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10'
      )}></div>
    </Link>
  );
});

NavigationItemComponent.displayName = 'NavigationItemComponent';

const ModernSidebar: React.FC<SidebarProps> = memo(({ sidebarOpen, setSidebarOpen }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, getRoleDashboard } = useAuthStore();
  const { viewingAsRole, setRoleView, resetToAdminView } = useAdminViewStore();
  const roleName = getRoleDisplayName(user?.role_id || '');
  const roleColor = getRoleThemeColor(user?.role_id || '');
  const dashboardPath = getRoleDashboard();
  const [expandedSections, setExpandedSections] = useState<string[]>(['vendor management']);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(user?.user_status === 'online');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Sync status with user data when it changes
  React.useEffect(() => {
    if (user?.user_status) {
      setIsOnline(user.user_status === 'online');
    }
  }, [user?.user_status]);

  // Listen for storage changes to sync collapsed state across components
  React.useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('sidebarCollapsed');
      setIsCollapsed(saved === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('sidebarToggle', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebarToggle', handleStorageChange);
    };
  }, []);

  const toggleSection = useCallback((sectionName: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionName)
        ? prev.filter(name => name !== sectionName)
        : [...prev, sectionName]
    );
  }, []);

  const toggleSidebar = useCallback(() => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
    // Dispatch event for same-tab updates
    window.dispatchEvent(new Event('sidebarToggle'));
  }, [isCollapsed]);

  // Handle admin role category clicks
  const handleRoleCategoryClick = useCallback((roleName: string) => {
    // Use actual database role IDs (verified from database)
    const roleMap: Record<string, { role: string; roleId: number; displayName: string; slug: string }> = {
      'Technical Director': { role: 'technicalDirector', roleId: 7, displayName: 'Technical Director', slug: 'technical-director' },
      'Estimator': { role: 'estimator', roleId: 4, displayName: 'Estimator', slug: 'estimator' },
      'Project Manager': { role: 'projectManager', roleId: 6, displayName: 'Project Manager', slug: 'project-manager' },
      'MEP': { role: 'mep', roleId: 11, displayName: 'MEP Manager', slug: 'mep' },
      'Site Engineer': { role: 'siteEngineer', roleId: 3, displayName: 'Site Engineer', slug: 'site-engineer' },
      'Procurement': { role: 'buyer', roleId: 8, displayName: 'Procurement', slug: 'buyer' },
      'Production Manager': { role: 'productionManager', roleId: 9, displayName: 'Production Manager', slug: 'production-manager' }
    };

    const roleInfo = roleMap[roleName];
    if (roleInfo) {
      setRoleView(roleInfo.role, roleInfo.roleId, roleInfo.displayName);
      showSuccess(`Now viewing as ${roleInfo.displayName}`);
      setSidebarOpen(false); // Close sidebar on mobile
      // Navigate to the role's dashboard
      navigate(`/${roleInfo.slug}/dashboard`);
    }
  }, [setRoleView, setSidebarOpen, navigate]);

  const handleToggleStatus = async () => {
    if (!user?.user_id) return;

    try {
      setUpdatingStatus(true);
      const newStatus = isOnline ? 'offline' : 'online';

      // Use the appropriate service based on role
      if (user?.role_id === UserRole.SITE_ENGINEER) {
        await siteEngineerService.updateUserStatus(user.user_id, newStatus);
      } else if (user?.role_id === UserRole.PROJECT_MANAGER) {
        await projectManagerService.updateUserStatus(user.user_id, newStatus);
      } else {
        // For all other roles, use direct API call
        const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const token = localStorage.getItem('access_token');
        await axios.post(`${API_URL}/user_status`, {
          user_id: user.user_id,
          status: newStatus
        }, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
      }

      // Update local state
      setIsOnline(!isOnline);

      // Update the user in auth store
      const { setUser } = useAuthStore.getState();
      if (user) {
        setUser({
          ...user,
          user_status: newStatus
        });
      }

      showSuccess(`You are now ${newStatus}`);

      // Close the dropdown after toggling status
      setUserDropdownOpen(false);
    } catch (error: any) {
      console.error('Error updating status:', error);
      showError('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };


  // Memoized navigation items to prevent re-calculation on every render
  const navigation = useMemo(() => {
    const roleId = user?.role_id;
    const isAdmin = user?.role === 'admin' || user?.role_id === 5; // Database has admin as role_id 5

    // Determine which role to use for building paths
    // If admin is viewing as another role, use that role; otherwise use actual role
    const effectiveRoleForPaths = isAdmin && viewingAsRole && viewingAsRole !== 'admin'
      ? viewingAsRole
      : (roleId || '');

    // Build role-prefixed paths
    const buildPath = (path: string) => buildRolePath(effectiveRoleForPaths, path);

    const baseItems: NavigationItem[] = [
      {
        name: `Dashboard`,
        href: buildPath('/dashboard'),
        icon: HomeIcon,
        iconSolid: HomeSolid,
        color: 'text-[#243d8a]'
      }
    ];

    // Technical Director specific navigation items
    const technicalDirectorItems: NavigationItem[] = [
      {
        name: 'Project Approvals',
        href: buildPath('/project-approvals'),
        icon: DocumentCheckIcon,
        iconSolid: DocumentCheckSolid,
        color: 'text-green-600'
      },
      {
        name: 'Vendor Management',
        href: buildPath('/vendors'),
        icon: UsersIcon,
        iconSolid: UsersSolid,
        color: 'text-purple-600'
      },
      {
        name: 'Production Management',
        href: buildPath('/record-material'),
        icon: ShoppingCartIcon,
        iconSolid: ShoppingCartIcon,
        color: 'text-indigo-600'
      },
      {
        name: 'Purchase Orders',
        href: buildPath('/change-requests'),
        icon: DocumentPlusIcon,
        iconSolid: DocumentPlusSolid,
        color: 'text-red-600'
      }
    ];

    // Project Manager specific navigation items
    const projectManagerItems: NavigationItem[] = [
      {
        name: 'My Projects',
        href: buildPath('/my-projects'),
        icon: BuildingOfficeIcon,
        iconSolid: BuildingOfficeSolid,
        color: 'text-blue-600'
      },
      {
        name: 'Production Management',
        href: buildPath('/record-material'),
        icon: ShoppingCartIcon,
        iconSolid: ShoppingCartIcon,
        color: 'text-indigo-600'
      },
      {
        name: 'Material Purchase',
        href: buildPath('/extra-material'),
        icon: CubeIcon,
        iconSolid: CubeSolid,
        color: 'text-purple-600'
      }
    ];

    // Estimator specific navigation items
    const estimatorItems: NavigationItem[] = [
      {
        name: 'Projects',
        href: buildPath('/projects'),
        icon: BuildingOfficeIcon,
        iconSolid: BuildingOfficeSolid,
        color: 'text-blue-600'
      },
      {
        name: 'Purchase Orders',
        href: buildPath('/change-requests'),
        icon: DocumentPlusIcon,
        iconSolid: DocumentPlusSolid,
        color: 'text-yellow-600'
      }
    ];

    // Site Engineer specific navigation items
    const siteEngineerItems: NavigationItem[] = [
      {
        name: 'Projects',
        href: buildPath('/projects'),
        icon: BuildingOfficeIcon,
        iconSolid: BuildingOfficeSolid,
        color: 'text-blue-600'
      },
      {
        name: 'Material Purchase',
        href: buildPath('/extra-material'),
        icon: CubeIcon,
        iconSolid: CubeSolid,
        color: 'text-orange-600'
      }
    ];

    // Buyer specific navigation items
    const buyerItems: NavigationItem[] = [
      // {
      //   name: 'Materials to Purchase',
      //   href: buildPath('/materials'),
      //   icon: CubeIcon,
      //   iconSolid: CubeSolid,
      //   color: 'text-orange-600'
      // },
      {
        name: 'Purchase Orders',
        href: buildPath('/purchase-orders'),
        icon: ShoppingCartIcon,
        iconSolid: ShoppingSolid,
        color: 'text-green-600'
      },
      {
        name: 'Vendors',
        href: buildPath('/vendors'),
        icon: UsersIcon,
        iconSolid: UsersSolid,
        color: 'text-purple-600'
      },
      {
        name: 'Store',
        href: buildPath('/store'),
        icon: BuildingOfficeIcon,
        iconSolid: BuildingOfficeSolid,
        color: 'text-blue-600'
      }
    ];

    // Production Manager specific navigation items - M2 Store Management
    const productionManagerItems: NavigationItem[] = [
      {
        name: 'M2 Store',
        href: buildPath('/m2-store'),
        icon: BuildingOfficeIcon,
        iconSolid: BuildingOfficeSolid,
        color: 'text-amber-600',
        children: [
          {
            name: 'Materials Master',
            href: buildPath('/m2-store/materials'),
            icon: CubeIcon,
            iconSolid: CubeSolid,
            color: 'text-teal-600'
          },
          // NOTE: Below sections are temporarily commented out for production - will be enabled in future releases
          // {
          //   name: 'Receive Stock (GRN)',
          //   href: buildPath('/m2-store/receive'),
          //   icon: DocumentPlusIcon,
          //   iconSolid: DocumentPlusSolid,
          //   color: 'text-green-600'
          // },
          // {
          //   name: 'Dispatch Materials',
          //   href: buildPath('/m2-store/dispatch'),
          //   icon: ShoppingCartIcon,
          //   iconSolid: ShoppingSolid,
          //   color: 'text-purple-600'
          // },
          // {
          //   name: 'Stock Take',
          //   href: buildPath('/m2-store/stock-take'),
          //   icon: ClipboardDocumentCheckIcon,
          //   iconSolid: ClipboardDocumentCheckSolid,
          //   color: 'text-orange-600'
          // },
          // {
          //   name: 'Reports & Analytics',
          //   href: buildPath('/m2-store/reports'),
          //   icon: DocumentTextIcon,
          //   iconSolid: DocumentTextSolid,
          //   color: 'text-indigo-600'
          // }
        ]
      }
    ];

    // Admin specific navigation items - Only User Management
    // Admin accesses vendor section through role switching (viewing as Technical Director)
    const adminItems: NavigationItem[] = [
      {
        name: 'User Management',
        href: buildPath('/user-management'),
        icon: UsersIcon,
        iconSolid: UsersSolid,
        color: 'text-[#243d8a]'
      }
    ];


    // For other roles, keep procurement and vendor management
    const procurementItem: NavigationItem = {
      name: 'Procurement',
      href: buildPath('/procurement'),
      icon: ShoppingCartIcon,
      iconSolid: ShoppingSolid,
      color: 'text-red-600'
    };

    const vendorManagementItem: NavigationItem = {
      name: 'Vendor Management',
      href: buildPath('/vendor-management'),
      icon: UsersIcon,
      iconSolid: UsersSolid,
      color: 'text-blue-600'
    };

    // Only add Vendor Management for roles that have access to it
    // According to PDF workflow: PM, Procurement, Estimation, Accounts
    // Site/MEP Supervisors and Technical Director do NOT have vendor access
    const vendorAllowedRoles = [
      UserRole.PROJECT_MANAGER,
      UserRole.PROCUREMENT,
      UserRole.ESTIMATION,
      UserRole.ACCOUNTS
    ];

    // Use utility function to get proper role name
    const currentRole = getRoleName(roleId);
    const roleIdLower = typeof roleId === 'string' ? roleId.toLowerCase() : '';

    let navigation = [...baseItems];

    // Check for Technical Director with multiple format variations
    // Also check the display name and role name
    const isTechnicalDirector = user?.role_id === UserRole.TECHNICAL_DIRECTOR ||
        roleId === 'technicalDirector' ||
        roleIdLower === 'technical director' ||
        roleIdLower === 'technical_director' ||
        roleIdLower === 'technicaldirector' ||
        currentRole === UserRole.TECHNICAL_DIRECTOR ||
        getRoleDisplayName(roleId || '') === 'Technical Director';

    // Check for Estimator with multiple format variations
    const isEstimator = user?.role_id === UserRole.ESTIMATION ||
        roleId === 'estimation' ||
        roleIdLower === 'estimation' ||
        roleIdLower === 'estimator' ||
        currentRole === UserRole.ESTIMATION ||
        getRoleDisplayName(roleId || '') === 'Estimator';

    // Check for Site Engineer with multiple format variations
    const isSiteEngineer = user?.role_id === UserRole.SITE_ENGINEER ||
        roleId === 'siteEngineer' ||
        roleIdLower === 'site engineer' ||
        roleIdLower === 'site_engineer' ||
        roleIdLower === 'siteengineer' ||
        currentRole === UserRole.SITE_ENGINEER ||
        getRoleDisplayName(roleId || '') === 'Site Engineer';

    // Check for Buyer with multiple format variations
    const isBuyer = roleId === 'buyer' ||
        roleIdLower === 'buyer' ||
        currentRole === 'buyer' ||
        getRoleDisplayName(roleId || '') === 'Buyer';

    // Check for Production Manager with multiple format variations
    const isProductionManager = roleId === 'productionManager' ||
        roleIdLower === 'productionmanager' ||
        roleIdLower === 'production manager' ||
        roleIdLower === 'production_manager' ||
        currentRole === 'productionManager' ||
        currentRole === UserRole.PRODUCTION_MANAGER ||
        getRoleDisplayName(roleId || '') === 'Production Manager' ||
        roleId === 9; // Database role_id for production manager

    // Check for Admin with multiple format variations (using isAdmin from line 324)
    if (isAdmin) {
      // Check if admin is viewing as another role
      if (viewingAsRole && viewingAsRole !== 'admin') {
        // Add "Back to Admin" button
        navigation.push({
          name: '← Back to Admin View',
          href: '##back##',
          icon: UserIcon,
          iconSolid: UserIcon,
          color: 'text-red-600'
        });

        // Show the selected role's navigation items
        switch (viewingAsRole) {
          case 'technicalDirector':
            navigation.push(...technicalDirectorItems);
            break;
          case 'estimator':
            navigation.push(...estimatorItems);
            break;
          case 'projectManager':
            navigation.push(...projectManagerItems);
            break;
          case 'mep':
            navigation.push(...projectManagerItems); // MEP shares PM menu items
            break;
          case 'siteEngineer':
            navigation.push(...siteEngineerItems);
            break;
          case 'buyer':
            navigation.push(...buyerItems);
            break;
          case 'productionManager':
            navigation.push(...productionManagerItems);
            break;
          default:
            navigation.push(...adminItems);
        }
      } else {
        // Admin default view - show admin items + role categories
        navigation.push(...adminItems);

        // Add role category navigation items for admin
        navigation.push({
          name: 'Technical Director',
          href: '#',
          icon: UserGroupIcon,
          iconSolid: UserGroupIcon,
          color: 'text-blue-600'
        });
        navigation.push({
          name: 'Estimator',
          href: '#',
          icon: UserGroupIcon,
          iconSolid: UserGroupIcon,
          color: 'text-indigo-600'
        });
        navigation.push({
          name: 'Project Manager',
          href: '#',
          icon: UserGroupIcon,
          iconSolid: UserGroupIcon,
          color: 'text-green-600'
        });
        navigation.push({
          name: 'MEP',
          href: '#',
          icon: UserGroupIcon,
          iconSolid: UserGroupIcon,
          color: 'text-cyan-600'
        });
        navigation.push({
          name: 'Site Engineer',
          href: '#',
          icon: UserGroupIcon,
          iconSolid: UserGroupIcon,
          color: 'text-orange-600'
        });
        navigation.push({
          name: 'Procurement',
          href: '#',
          icon: UserGroupIcon,
          iconSolid: UserGroupIcon,
          color: 'text-purple-600'
        });
        navigation.push({
          name: 'Production Manager',
          href: '#',
          icon: UserGroupIcon,
          iconSolid: UserGroupIcon,
          color: 'text-amber-600'
        });
      }
    } else if (isTechnicalDirector) {
      // Technical Director gets specialized menu items
      navigation.push(...technicalDirectorItems);
    } else if (isEstimator) {
      // Estimator gets Projects page, not Procurement
      navigation.push(...estimatorItems);
    } else if (
      user?.role_id === UserRole.PROJECT_MANAGER ||
      currentRole === UserRole.PROJECT_MANAGER ||
      user?.role_id === UserRole.MEP ||
      currentRole === UserRole.MEP ||
      currentRole === 'mep' ||
      roleIdLower === 'mep' ||
      getRoleDisplayName(roleId || '') === 'MEP Manager'
    ) {
      // Project Manager AND MEP Manager get the same specialized menu items - SHARED CODE
      navigation.push(...projectManagerItems);
    } else if (isSiteEngineer) {
      // Site Engineer gets Projects menu with submenu (Assigned, Ongoing, Completed)
      navigation.push(...siteEngineerItems);
    } else if (isBuyer) {
      // Buyer gets Materials to Purchase, Projects, and Purchase Orders
      navigation.push(...buyerItems);
    } else if (isProductionManager) {
      // Production Manager gets M2 Store Management items
      navigation.push(...productionManagerItems);
    } else {
      // Other roles get procurement
      navigation.push(procurementItem);

      // Add vendor management for allowed roles (excluding Technical Director, Estimator, PM, MEP, and SE)
      if (vendorAllowedRoles.includes(currentRole as UserRole) &&
          currentRole !== UserRole.PROJECT_MANAGER &&
          currentRole !== UserRole.MEP &&
          currentRole !== 'mep' &&
          currentRole !== UserRole.ESTIMATION &&
          currentRole !== UserRole.SITE_ENGINEER) {
        navigation.push(vendorManagementItem);
      }
    }

    // Profile removed from sidebar - use header dropdown instead
    return navigation;
  }, [user?.role_id, viewingAsRole]);

  const isPathActive = useCallback((href: string) => {
    // Extract the base path from both href and location
    const pathParts = location.pathname.split('/').filter(Boolean);
    const hrefParts = href.split('/').filter(Boolean);
    
    // Remove role prefix from comparison if present
    if (pathParts.length > 0 && hrefParts.length > 0) {
      const locationBasePath = pathParts.slice(1).join('/');
      const hrefBasePath = hrefParts.slice(1).join('/');
      
      if (hrefBasePath === 'dashboard') {
        return locationBasePath === 'dashboard';
      }
      return locationBasePath.startsWith(hrefBasePath);
    }
    
    return false;
  }, [location.pathname]);

  const SidebarContent = useCallback(() => {
    return (
      <div className="flex flex-col h-full bg-white border-r border-gray-200 shadow-xl will-change-auto">
      {/* Logo Section with Toggle Button */}
      <div className={clsx(
        "border-b border-gray-100 transition-all duration-300",
        isCollapsed ? "px-2 py-3" : "px-4 py-4"
      )}>
        <div className="flex items-center justify-between">
          {/* MeterSquare Logo */}
          <div className={clsx(
            "relative transition-all duration-300",
            isCollapsed ? "hidden" : "block"
          )}>
            <img
              src="/assets/logo.png"
              alt="MeterSquare"
              className="h-10 w-auto"
              onError={(e) => {
                // Fallback if logo doesn't load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <div className="hidden w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-lg shadow-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
          </div>
          {/* Collapsed Logo */}
          <div className={clsx(
            "transition-all duration-300",
            isCollapsed ? "block mx-auto" : "hidden"
          )}>
            <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-red-700 rounded-lg shadow-md flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
          </div>
          
          {/* Toggle Button */}
          <button
            onClick={toggleSidebar}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRightIcon className="w-4 h-4 text-gray-600" />
            ) : (
              <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
            )}
          </button>
        </div>
        {/* Decorative element */}
        <div className={clsx(
          "mt-3 h-0.5 bg-gradient-to-r from-red-400 to-red-600 rounded-full transition-all duration-300",
          isCollapsed ? "hidden" : "block"
        )}></div>
      </div>

      {/* Navigation */}
      <div className={clsx(
        "flex-1 flex flex-col overflow-y-auto transition-[padding] duration-200",
        isCollapsed ? "py-2 px-1" : "py-3 px-2"
      )}>
        <nav className="flex-1 space-y-1">
          {navigation.map((item) => {
            const isActive = isPathActive(item.href);
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedSections.includes(item.name.toLowerCase());
            const isRoleCategory = item.href === '#'; // Role categories have '#' href
            const isBackButton = item.href === '##back##'; // Back to admin button

            return (
              <div key={item.name}>
                {/* Main Navigation Item */}
                <div className="relative">
                  {isRoleCategory ? (
                    // Special handling for role category items
                    <button
                      onClick={() => handleRoleCategoryClick(item.name)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors',
                        isCollapsed ? 'justify-center' : '',
                        'text-gray-700 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 hover:text-gray-900'
                      )}
                    >
                      <item.icon className={clsx('w-5 h-5', item.color || 'text-gray-500')} />
                      {!isCollapsed && <span>{item.name}</span>}
                    </button>
                  ) : isBackButton ? (
                    // Back to admin button
                    <button
                      onClick={() => {
                        resetToAdminView();
                        navigate('/admin/dashboard');
                        showSuccess('Returned to Admin view');
                        setSidebarOpen(false);
                      }}
                      className={clsx(
                        'w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold rounded-lg transition-colors',
                        isCollapsed ? 'justify-center' : '',
                        'bg-gradient-to-r from-red-50 to-orange-50 text-red-700 hover:from-red-100 hover:to-orange-100 border border-red-200'
                      )}
                    >
                      <item.icon className="w-5 h-5 text-red-600" />
                      {!isCollapsed && <span>{item.name}</span>}
                    </button>
                  ) : (
                    <NavigationItemComponent
                      item={item}
                      isActive={isActive}
                      isCollapsed={isCollapsed}
                      isExpanded={isExpanded}
                      hasChildren={hasChildren || false}
                      onToggleSection={toggleSection}
                      onNavigate={() => setSidebarOpen(false)}
                    />
                  )}
                </div>

                {/* Submenu - Hide when collapsed */}
                <AnimatePresence mode="wait">
                  {hasChildren && isExpanded && !isCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15, ease: 'easeInOut' }}
                      className="ml-6 mt-2 space-y-1 border-l-2 border-red-100 pl-3"
                    >
                      {item.children?.map((child) => {
                        const isChildActive = isPathActive(child.href);
                        const ChildIcon = isChildActive ? child.iconSolid : child.icon;
                        
                        return (
                          <Link
                            key={child.name}
                            to={child.href}
                            onClick={() => setSidebarOpen(false)}
                            className={clsx(
                              'group flex items-center px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 relative',
                              isChildActive
                                ? 'bg-gradient-to-r from-red-50 to-red-100 text-red-800 border border-red-200 shadow-sm'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                            )}
                          >
                            {/* Active indicator for submenu items */}
                            {isChildActive && (
                              <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-0.5 h-4 bg-red-500 rounded-r-full"></div>
                            )}
                            <ChildIcon className={clsx(
                              'w-4 h-4 mr-3 transition-colors duration-200 flex-shrink-0',
                              isChildActive ? 'text-red-600' : 'text-gray-400 group-hover:text-gray-600'
                            )} />
                            <span className="truncate">{child.name}</span>
                            
                            {/* Hover effect for submenu items */}
                            <div className={clsx(
                              "absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg",
                              'bg-gradient-to-r from-red-500/5 to-red-500/10'
                            )}></div>
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* User Info Section with Dropdown */}
        {user && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="relative">
              {/* User Info Button - Clickable */}
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="w-full bg-gradient-to-r from-gray-50 to-[#243d8a]/5 rounded-lg p-3 border border-gray-200 hover:border-[#243d8a]/30 transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#243d8a] to-[#243d8a] flex items-center justify-center shadow-md">
                        <span className="text-white font-bold text-xs">
                          {user.full_name.split(' ')[0].charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-xs font-semibold text-gray-900 truncate">
                        {user.full_name.split(' ').slice(0, -1).join(' ') || user.full_name}
                      </p>
                      <p className="text-[10px] text-gray-600 truncate">
                        {roleName}
                      </p>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <ChevronDownIcon 
                      className={clsx(
                        "w-4 h-4 text-gray-400 transition-transform duration-200",
                        userDropdownOpen ? "transform rotate-180" : ""
                      )} 
                    />
                  )}
                </div>
              </button>

              {/* Dropdown Menu */}
              <AnimatePresence mode="wait">
                {userDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.12, ease: 'easeInOut' }}
                    className="absolute bottom-full mb-2 left-0 right-0 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50"
                  >
                    {/* Status Toggle - Available for all roles */}
                    <div className="px-4 py-3 border-b border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                          <span className="text-xs font-medium text-gray-700">Status</span>
                        </div>
                        <button
                          onClick={handleToggleStatus}
                          disabled={updatingStatus}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            isOnline ? 'bg-green-500' : 'bg-gray-300'
                          } ${updatingStatus ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
                              isOnline ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      <div className="mt-1">
                        <span className={`text-xs font-semibold ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>

                    <Link
                      to={buildRolePath(user?.role_id || '', 'profile')}
                      onClick={() => {
                        setUserDropdownOpen(false);
                        setSidebarOpen(false);
                      }}
                      className="flex items-center px-4 py-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                    >
                      <UserCircleIcon className="w-4 h-4 text-gray-500 mr-3" />
                      <span>Profile Settings</span>
                    </Link>

                    <button
                      onClick={() => {
                        const { logout } = useAuthStore.getState();
                        logout();
                      }}
                      className="w-full flex items-center px-4 py-3 text-xs font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors duration-200 border-t border-gray-100"
                    >
                      <ArrowRightOnRectangleIcon className="w-4 h-4 text-gray-500 mr-3" />
                      <span>Sign Out</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Version Info */}
        <div className="mt-4 px-4 text-center">
          <p className="text-xs text-gray-400">Version 1.0.0</p>
          <div className="mt-2 w-full h-0.5 bg-gradient-to-r from-transparent via-[#243d8a]/30 to-transparent"></div>
        </div>
      </div>
      </div>
    );
  }, [navigation, isCollapsed, expandedSections, user, userDropdownOpen, toggleSection, toggleSidebar, isPathActive, setSidebarOpen]);

  return (
    <>
      {/* Mobile sidebar */}
      <Transition.Root show={sidebarOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50 md:hidden" onClose={setSidebarOpen}>
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-600/75 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 flex z-50">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative flex-1 flex flex-col max-w-xs w-full shadow-2xl">
                <Transition.Child
                  as={Fragment}
                  enter="ease-in-out duration-300"
                  enterFrom="opacity-0"
                  enterTo="opacity-100"
                  leave="ease-in-out duration-300"
                  leaveFrom="opacity-100"
                  leaveTo="opacity-0"
                >
                  <div className="absolute top-0 right-0 -mr-12 pt-2">
                    <button
                      type="button"
                      className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white bg-white/10 backdrop-blur-sm"
                      onClick={() => setSidebarOpen(false)}
                    >
                      <span className="sr-only">Close sidebar</span>
                      <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
                    </button>
                  </div>
                </Transition.Child>
                <SidebarContent />
              </Dialog.Panel>
            </Transition.Child>
            <div className="flex-shrink-0 w-14">{/* Force sidebar to shrink to fit close icon */}</div>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Static sidebar for desktop */}
      <div className={clsx(
        "hidden md:flex md:flex-col md:fixed md:inset-y-0 z-40 transition-[width] duration-200 ease-in-out",
        isCollapsed ? "md:w-16" : "md:w-56"
      )}>
        <div className="flex-1 flex flex-col min-h-0">
          <SidebarContent />
        </div>
      </div>
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return prevProps.sidebarOpen === nextProps.sidebarOpen;
});

ModernSidebar.displayName = 'ModernSidebar';

export default ModernSidebar;
