/**
 * Navigation Service
 * Provides SPA-friendly navigation that can be used from anywhere in the app
 * (including non-React code like services)
 *
 * Uses custom events to trigger React Router navigation without full page reload
 */

// Custom event name for navigation requests
const NAVIGATE_EVENT = 'spa-navigate';

interface NavigateEventDetail {
  path: string;
  replace?: boolean;
}

/**
 * Navigate to a path using SPA navigation (no page reload)
 * This dispatches a custom event that is handled by NavigationListener component
 *
 * @param path - The path to navigate to (e.g., '/technical-director/project-approvals?tab=revisions')
 * @param options - Navigation options
 */
export const navigateTo = (path: string, options?: { replace?: boolean }): void => {
  // Only handle internal paths (starting with /)
  if (!path.startsWith('/')) {
    // External URL - use regular navigation
    window.location.href = path;
    return;
  }

  // Dispatch custom event for SPA navigation
  const event = new CustomEvent<NavigateEventDetail>(NAVIGATE_EVENT, {
    detail: {
      path,
      replace: options?.replace || false
    }
  });

  window.dispatchEvent(event);
};

/**
 * Subscribe to navigation events
 * Used internally by NavigationListener component
 *
 * @param callback - Function to call when navigation is requested
 * @returns Cleanup function to remove listener
 */
export const subscribeToNavigation = (
  callback: (path: string, replace: boolean) => void
): (() => void) => {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<NavigateEventDetail>;
    callback(customEvent.detail.path, customEvent.detail.replace || false);
  };

  window.addEventListener(NAVIGATE_EVENT, handler);

  return () => {
    window.removeEventListener(NAVIGATE_EVENT, handler);
  };
};
