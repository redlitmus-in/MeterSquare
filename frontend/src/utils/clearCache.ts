/**
 * Utility to clear all cached authentication and user data
 * Use this when you need to force a fresh start or fix role mismatches
 */
export const clearAllCachedData = () => {
  // Clear all auth-related localStorage items
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
  localStorage.removeItem('auth-storage');
  localStorage.removeItem('sidebarCollapsed');
  
  // Clear session storage if any
  sessionStorage.clear();
  
  console.log('All cached data has been cleared');
};

/**
 * Clear only user data while keeping auth token
 * Useful for forcing a refresh of user data
 */
export const clearUserCache = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('auth-storage');
  
  console.log('User cache cleared, auth token preserved');
};

// Auto-clear cache on window focus if role mismatch detected
export const setupCacheValidator = () => {
  window.addEventListener('focus', () => {
    const storedUser = localStorage.getItem('user');
    const authStorage = localStorage.getItem('auth-storage');
    
    if (storedUser && authStorage) {
      try {
        const user = JSON.parse(storedUser);
        const auth = JSON.parse(authStorage);
        
        // Check for role mismatch
        if (auth.state?.user?.role_id !== user.role_id) {
          console.warn('Role mismatch detected, clearing cache');
          clearUserCache();
          window.location.reload();
        }
      } catch (e) {
        console.error('Failed to validate cache', e);
        clearUserCache();
      }
    }
  });
};