/**
 * Admin View Context Store
 * Manages admin's current role view context for navigation and UI
 * ONLY used by admin role - does not affect other roles
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdminViewState {
  // Current role context admin is viewing as
  viewingAsRole: string | null; // e.g., 'estimator', 'projectManager', 'buyer'
  viewingAsRoleId: number | null;
  viewingAsRoleName: string | null; // Display name
  viewingAsUserId: number | null; // Specific user's ID when viewing as that user

  // Set role view context (only works for admin users)
  setRoleView: (role: string, roleId: number, roleName: string, userId?: number) => void;

  // Reset to default admin view
  resetToAdminView: () => void;

  // Check if currently viewing as a specific role
  isViewingAs: (role: string) => boolean;

  // Clear all view context (used when non-admin logs in)
  clearViewContext: () => void;
}

// Helper to check if current user is admin
const isCurrentUserAdmin = (): boolean => {
  try {
    const authStorage = localStorage.getItem('auth-storage');
    if (!authStorage) return false;
    const auth = JSON.parse(authStorage);
    const userRole = auth?.state?.user?.role?.toLowerCase();
    return userRole === 'admin';
  } catch {
    return false;
  }
};

export const useAdminViewStore = create<AdminViewState>()(
  persist(
    (set, get) => ({
      viewingAsRole: null,
      viewingAsRoleId: null,
      viewingAsRoleName: null,
      viewingAsUserId: null,

      setRoleView: (role: string, roleId: number, roleName: string, userId?: number) => {
        // Only allow admins to set view context
        if (!isCurrentUserAdmin()) {
          console.warn('setRoleView called by non-admin user - ignoring');
          return;
        }

        set({
          viewingAsRole: role,
          viewingAsRoleId: roleId,
          viewingAsRoleName: roleName,
          viewingAsUserId: userId || null
        });
      },

      resetToAdminView: () => {
        set({
          viewingAsRole: null,
          viewingAsRoleId: null,
          viewingAsRoleName: null,
          viewingAsUserId: null
        });
      },

      clearViewContext: () => {
        set({
          viewingAsRole: null,
          viewingAsRoleId: null,
          viewingAsRoleName: null,
          viewingAsUserId: null
        });
      },

      isViewingAs: (role: string) => {
        // Only return true for admin users
        if (!isCurrentUserAdmin()) {
          return false;
        }
        const state = get();
        return state.viewingAsRole === role;
      }
    }),
    {
      name: 'admin-view-storage',
      partialize: (state) => ({
        viewingAsRole: state.viewingAsRole,
        viewingAsRoleId: state.viewingAsRoleId,
        viewingAsRoleName: state.viewingAsRoleName,
        viewingAsUserId: state.viewingAsUserId
      }),
    }
  )
);
