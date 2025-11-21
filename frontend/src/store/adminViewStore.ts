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

  // Set role view context
  setRoleView: (role: string, roleId: number, roleName: string, userId?: number) => void;

  // Reset to default admin view
  resetToAdminView: () => void;

  // Check if currently viewing as a specific role
  isViewingAs: (role: string) => boolean;
}

export const useAdminViewStore = create<AdminViewState>()(
  persist(
    (set, get) => ({
      viewingAsRole: null,
      viewingAsRoleId: null,
      viewingAsRoleName: null,
      viewingAsUserId: null,

      setRoleView: (role: string, roleId: number, roleName: string, userId?: number) => {
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

      isViewingAs: (role: string) => {
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
