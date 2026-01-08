/**
 * NavigationListener Component
 * Listens for navigation events from navigationService and uses React Router to navigate
 * This enables SPA navigation from non-React code (like services)
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { subscribeToNavigation } from '@/utils/navigationService';

const NavigationListener: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Subscribe to navigation events
    const unsubscribe = subscribeToNavigation((path, replace) => {
      // Use React Router navigate for SPA navigation (no page reload)
      navigate(path, { replace });
    });

    return () => {
      unsubscribe();
    };
  }, [navigate]);

  // This component doesn't render anything
  return null;
};

export default NavigationListener;
