/**
 * Authorization Validation Utility
 * Provides server-side backed authorization checks
 */

import { secureStorage } from './secureStorage';
import { apiClient } from '../api/config';

export type UserRole =
  | 'estimation'
  | 'procurement'
  | 'project-manager'
  | 'technical-director'
  | 'accounts'
  | 'design'
  | 'site-supervisor'
  | 'mep-supervisor'
  | 'factory-supervisor'
  | 'admin';

export interface Permission {
  resource: string;
  action: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  token: string;
  lastValidated?: number;
}

class AuthValidator {
  private static instance: AuthValidator;
  private validationCache: Map<string, { result: boolean; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly VALIDATION_INTERVAL = 10 * 60 * 1000; // 10 minutes

  private constructor() {
    // Start periodic validation
    this.startPeriodicValidation();
  }

  static getInstance(): AuthValidator {
    if (!AuthValidator.instance) {
      AuthValidator.instance = new AuthValidator();
    }
    return AuthValidator.instance;
  }

  /**
   * Start periodic background validation
   */
  private startPeriodicValidation(): void {
    setInterval(async () => {
      const user = this.getCurrentUser();
      if (user) {
        await this.validateUserRole(user.role);
      }
    }, this.VALIDATION_INTERVAL);
  }

  /**
   * Get current user with proper typing
   */
  getCurrentUser(): AuthUser | null {
    const user = secureStorage.getUser();
    if (!user || !user.role) {
      return null;
    }
    return user as AuthUser;
  }

  /**
   * Validate user role with server
   */
  async validateUserRole(role: UserRole): Promise<boolean> {
    const cacheKey = `role_${role}`;
    const cached = this.validationCache.get(cacheKey);

    // Return cached result if still valid
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }

    try {
      // In production, this should call your backend API
      // For now, we'll simulate the validation
      const response = await this.mockServerValidation(role);

      // Cache the result
      this.validationCache.set(cacheKey, {
        result: response.valid,
        timestamp: Date.now(),
      });

      // Update user's last validation timestamp
      const user = this.getCurrentUser();
      if (user) {
        secureStorage.setUser({
          ...user,
          lastValidated: Date.now(),
        });
      }

      return response.valid;
    } catch (error) {
      console.error('Role validation failed:', error);
      return false;
    }
  }

  /**
   * Mock server validation - replace with actual API call
   */
  private async mockServerValidation(role: UserRole): Promise<{ valid: boolean }> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // In production, this would be:
    // const response = await apiClient.post('/auth/validate-role', { role });
    // return response.data;

    return { valid: true };
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(resource: string, action: string): Promise<boolean> {
    const user = this.getCurrentUser();
    if (!user) return false;

    // Check local permissions first
    const hasLocalPermission = user.permissions?.some(
      p => p.resource === resource && p.action === action
    );

    if (!hasLocalPermission) return false;

    // Validate with server for sensitive operations
    const cacheKey = `perm_${resource}_${action}`;
    const cached = this.validationCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result;
    }

    try {
      // In production: await apiClient.post('/auth/validate-permission', { resource, action });
      const isValid = await this.mockPermissionValidation(resource, action);

      this.validationCache.set(cacheKey, {
        result: isValid,
        timestamp: Date.now(),
      });

      return isValid;
    } catch {
      return false;
    }
  }

  /**
   * Mock permission validation - replace with actual API call
   */
  private async mockPermissionValidation(resource: string, action: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return true;
  }

  /**
   * Validate workflow approval permission
   */
  async canApprove(workflowType: string, stage: string): Promise<boolean> {
    const user = this.getCurrentUser();
    if (!user) return false;

    const approvalMap: Record<string, Record<string, UserRole[]>> = {
      purchaseRequisition: {
        initial: ['site-supervisor', 'mep-supervisor'],
        procurement: ['procurement'],
        costApproval: ['project-manager'],
        estimation: ['estimation'],
        technicalReview: ['technical-director'],
        final: ['accounts'],
      },
      vendorQuotation: {
        initial: ['procurement'],
        review: ['project-manager'],
        estimation: ['estimation'],
        approval: ['technical-director'],
        final: ['accounts'],
      },
      materialRequisition: {
        initial: ['factory-supervisor'],
        store: ['procurement'],
        approval: ['project-manager'],
        estimation: ['estimation'],
        final: ['technical-director'],
      },
      materialDelivery: {
        initial: ['site-supervisor', 'mep-supervisor', 'factory-supervisor'],
        procurement: ['procurement'],
        approval: ['project-manager'],
        final: ['technical-director'],
      },
    };

    const allowedRoles = approvalMap[workflowType]?.[stage];
    if (!allowedRoles) return false;

    const hasRole = allowedRoles.includes(user.role);
    if (!hasRole) return false;

    // Validate with server for critical approvals
    return await this.validateUserRole(user.role);
  }

  /**
   * Check if user can access specific route
   */
  async canAccessRoute(route: string): Promise<boolean> {
    const user = this.getCurrentUser();
    if (!user) return false;

    const routePermissions: Record<string, UserRole[]> = {
      '/procurement': ['procurement', 'project-manager', 'technical-director', 'admin'],
      '/projects': ['project-manager', 'technical-director', 'admin'],
      '/analytics': ['project-manager', 'technical-director', 'estimation', 'admin'],
      '/tasks': ['all'] as any, // All roles can access tasks
      '/profile': ['all'] as any,
      '/workflows/material-dispatch-production': ['factory-supervisor', 'procurement', 'project-manager', 'admin'],
      '/workflows/material-dispatch-site': ['site-supervisor', 'mep-supervisor', 'procurement', 'admin'],
    };

    const allowedRoles = routePermissions[route];
    if (!allowedRoles) return true; // No restrictions

    if (allowedRoles.includes('all' as any)) return true;

    return allowedRoles.includes(user.role);
  }

  /**
   * Validate session token
   */
  async validateSession(): Promise<boolean> {
    const user = this.getCurrentUser();
    if (!user || !user.token) return false;

    try {
      // In production: await apiClient.post('/auth/validate-session', { token: user.token });
      const isValid = await this.mockSessionValidation(user.token);

      if (!isValid) {
        this.clearSession();
      }

      return isValid;
    } catch {
      this.clearSession();
      return false;
    }
  }

  /**
   * Mock session validation - replace with actual API call
   */
  private async mockSessionValidation(token: string): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 50));
    return token.length > 0;
  }

  /**
   * Clear user session
   */
  clearSession(): void {
    secureStorage.clear();
    this.validationCache.clear();
  }

  /**
   * Get role-based navigation items
   */
  getNavigationItems(role: UserRole): string[] {
    const navigationMap: Record<UserRole, string[]> = {
      'procurement': ['dashboard', 'procurement', 'tasks', 'analytics', 'profile'],
      'project-manager': ['dashboard', 'projects', 'procurement', 'tasks', 'analytics', 'profile'],
      'technical-director': ['dashboard', 'projects', 'procurement', 'analytics', 'profile'],
      'estimation': ['dashboard', 'analytics', 'tasks', 'profile'],
      'accounts': ['dashboard', 'procurement', 'analytics', 'profile'],
      'design': ['dashboard', 'projects', 'tasks', 'profile'],
      'site-supervisor': ['dashboard', 'workflows', 'tasks', 'profile'],
      'mep-supervisor': ['dashboard', 'workflows', 'tasks', 'profile'],
      'factory-supervisor': ['dashboard', 'workflows', 'tasks', 'profile'],
      'admin': ['dashboard', 'projects', 'procurement', 'workflows', 'analytics', 'tasks', 'profile'],
    };

    return navigationMap[role] || ['dashboard', 'profile'];
  }

  /**
   * Check if action requires additional verification
   */
  requiresAdditionalVerification(action: string): boolean {
    const sensitiveActions = [
      'approve_payment',
      'delete_project',
      'modify_user_role',
      'export_sensitive_data',
      'bulk_approval',
    ];

    return sensitiveActions.includes(action);
  }
}

export const authValidator = AuthValidator.getInstance();

// Export helper functions
export const getCurrentUser = () => authValidator.getCurrentUser();
export const validateUserRole = (role: UserRole) => authValidator.validateUserRole(role);
export const hasPermission = (resource: string, action: string) => authValidator.hasPermission(resource, action);
export const canApprove = (workflowType: string, stage: string) => authValidator.canApprove(workflowType, stage);
export const canAccessRoute = (route: string) => authValidator.canAccessRoute(route);
export const validateSession = () => authValidator.validateSession();
export const clearSession = () => authValidator.clearSession();