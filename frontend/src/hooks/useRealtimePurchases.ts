/**
 * Custom hook for real-time purchase updates
 * Provides role-specific purchase data with automatic updates
 */

import { useEffect, useState } from 'react';
import usePurchaseStore, { startPolling, stopPolling } from '@/store/purchaseStore';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';

interface UseRealtimePurchasesOptions {
  role: string;
  showNotifications?: boolean;
}

export const useRealtimePurchases = ({ role, showNotifications = true }: UseRealtimePurchasesOptions) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    purchases,
    isLoading,
    lastFetchTime,
    fetchPurchases,
    setupRealtimeSubscription,
    cleanupRealtimeSubscription,
    getPurchasesForRole
  } = usePurchaseStore();

  // Get role-specific purchases
  const rolePurchases = getPurchasesForRole(role);

  // Initialize real-time updates on mount
  useEffect(() => {
    // Store user role for the purchase store
    localStorage.setItem('userRole', role);

    // Setup real-time subscriptions
    setupRealtimeSubscription();

    // Start polling for updates
    startPolling(role);

    // Cleanup on unmount
    return () => {
      stopPolling();
      cleanupRealtimeSubscription();
    };
  }, [role, setupRealtimeSubscription, cleanupRealtimeSubscription]);

  // Manual refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchPurchases(role);
    setIsRefreshing(false);
    if (showNotifications) {
      showSuccess('Data refreshed');
    }
  };

  // Check for real-time status
  const isRealtime = lastFetchTime && Date.now() - lastFetchTime.getTime() < 15000;

  return {
    purchases: rolePurchases,
    allPurchases: purchases, // In case full list is needed
    isLoading,
    isRefreshing,
    lastFetchTime,
    isRealtime,
    handleRefresh,
    fetchPurchases: () => fetchPurchases(role)
  };
};

export default useRealtimePurchases;