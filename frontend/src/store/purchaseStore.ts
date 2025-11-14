/**
 * Centralized Purchase Store
 * Manages real-time purchase data across all roles with automatic updates
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { apiClient, API_ENDPOINTS } from '@/api/config';
import { toast } from 'sonner';
import { subscribeToRealtime } from '@/lib/realtimeSubscriptions';
import { sendPRNotification, requestNotificationPermission } from '@/middleware/notificationMiddleware';

interface Purchase {
  purchase_id: number;
  project_id: string | number;
  requested_by: string;
  created_by?: string;
  site_location: string;
  purpose?: string;
  date: string;
  created_at?: string;
  last_modified_at?: string;
  last_modified_by?: string;
  materials?: any[];
  material_details?: any[];
  material_count?: number;
  total_cost?: number;
  total_quantity?: number;
  priority?: string;
  status?: string;
  current_workflow_status?: string;
  current_status?: {
    status: string;
    updated_at?: string;
    updated_by?: string;
  };
  pm_status?: string;
  latest_status?: {
    sender: string;
    receiver: string;
    status: string;
    timestamp?: string;
  };
  sender_latest_status?: string;
  receiver_latest_status?: string;
  status_comments?: string;
  status_date?: string;
  status_receiver?: string;
  status_role?: string;
  status_sender?: string;
  decision_date?: string;
  email_sent?: boolean;
  file_path?: string;
  is_deleted?: boolean;
  procurement_status?: string;
  project_manager_status?: string;
  estimation_status?: string;
  technical_director_status?: string;
  accounts_status?: string;
  accounts_acknowledgement?: boolean;
  acknowledgement?: boolean;
  acknowledgement_sent?: boolean;
  project_manager_rejection_reason?: string;
  estimation_rejection_reason?: string;
  technical_director_rejection_reason?: string;
  accounts_rejection_reason?: string;
  rejected_status?: {
    status_id: number;
    status: string;
    sender: string;
    receiver: string;
    decision_date: string;
    created_at: string;
    created_by: string;
    comments: string;
    rejection_reason: string;
    reject_category: string;
    pm_status: string;
  };
  payment_details?: any;
  rejection_from?: string;
  requires_pm_action?: boolean;
}

interface PurchaseStore {
  // Data
  purchases: Purchase[];
  isLoading: boolean;
  error: string | null;
  lastFetchTime: Date | null;
  isPollingEnabled: boolean;
  pollingInterval: number;

  // Actions
  fetchPurchases: (role?: string) => Promise<void>;
  setPurchases: (purchases: Purchase[]) => void;
  updatePurchase: (purchaseId: number, updates: Partial<Purchase>) => void;
  addPurchase: (purchase: Purchase) => void;
  removePurchase: (purchaseId: number) => void;
  setPollingEnabled: (enabled: boolean) => void;
  setPollingInterval: (interval: number) => void;
  clearError: () => void;

  // Subscription management
  subscriptionCleanup: (() => void) | null;
  setupRealtimeSubscription: () => void;
  cleanupRealtimeSubscription: () => void;

  // Role-specific getters
  getPurchasesForRole: (role: string) => Purchase[];
}

// ✅ PERFORMANCE: Optimized polling interval (30 seconds)
// Real-time updates handled by WebSocket (socket.io) for instant updates
// Polling is now a fallback to ensure data consistency
const DEFAULT_POLLING_INTERVAL = 30000; // 30s (was 2s - 93% less network traffic!)

// Debounce timer for fetch requests
let fetchDebounceTimer: NodeJS.Timeout | null = null;

// Create store with persistence and subscriptions
const usePurchaseStore = create<PurchaseStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    purchases: [],
    isLoading: false,
    error: null,
    lastFetchTime: null,
    isPollingEnabled: true,
    pollingInterval: DEFAULT_POLLING_INTERVAL,
    subscriptionCleanup: null,

    // Fetch purchases based on role - NO DEBOUNCING for instant updates
    fetchPurchases: async (role?: string) => {
      // REMOVED debouncing - we want instant updates!
      const currentStore = get();


      try {
        // Only show loading on initial fetch, not on refresh
        if (!currentStore.lastFetchTime) {
          set({ isLoading: true, error: null });
        } else {
          set({ error: null });
        }

        let endpoint = '';
        let response: any;

        // Determine endpoint based on role - MATCHING ACTUAL BACKEND ROUTES
        switch (role?.toLowerCase()) {
          case 'procurement':
            endpoint = '/all_procurement';  // Backend: /all_procurement
            break;
          case 'projectmanager':
          case 'project manager':
          case 'project_manager':
            endpoint = '/projectmanger_purchases';  // Backend has typo: projectmanger (missing 'a')
            break;
          case 'estimation':
            endpoint = '/estimation_purchase';  // Backend: /estimation_purchase (correct)
            break;
          case 'technicaldirector':
          case 'technical director':
          case 'technical_director':
            endpoint = '/technical_purchase';  // Backend: /technical_purchase (not /purchases)
            break;
          case 'accounts':
            endpoint = '/account_purchase';  // Backend: /account_purchase (not /accounts/purchases)
            break;
          case 'sitesupervisor':
          case 'site supervisor':
          case 'site_supervisor':
            endpoint = '/all_purchase';  // Site supervisor uses /all_purchase endpoint
            break;
          case 'mepsupervisor':
          case 'mep supervisor':
          case 'mep_supervisor':
          case 'mep':  // Add 'mep' as an alias
            endpoint = '/mep_purchases';  // Use MEP-specific endpoint
            break;
          default:
            // IMPORTANT: For MEP supervisor, NEVER fall back to /all_purchase
            // Check if the role contains 'mep' to catch any variations
            if (role?.toLowerCase().includes('mep')) {
              endpoint = '/mep_purchases';
            } else {
              endpoint = '/all_purchase';  // Backend: /all_purchase
            }
        }


        response = await apiClient.get(endpoint);

        // Extract purchases from response
        let purchaseData: Purchase[] = [];

        if (response.data) {
          // Check for different response formats from different endpoints
          if (response.data.procurement) {
            // For /all_procurement endpoint
            purchaseData = response.data.procurement;
          } else if (endpoint === '/mep_purchases') {
            // For MEP supervisor endpoint - the response has data array directly in response.data.data
            console.log('[PurchaseStore] MEP endpoint response structure:', Object.keys(response.data));

            if (response.data.data && Array.isArray(response.data.data)) {
              purchaseData = response.data.data;
              console.log('[PurchaseStore] Found MEP purchases:', purchaseData.length, 'items');
            } else if (response.data.purchase_requests) {
              purchaseData = response.data.purchase_requests;
            } else if (response.data.purchases) {
              purchaseData = response.data.purchases;
            } else {
              // If no standard key, try to find an array in the response
              const keys = Object.keys(response.data);
              for (const key of keys) {
                if (Array.isArray(response.data[key]) && key !== 'pagination' && key !== 'filters') {
                  purchaseData = response.data[key];
                  console.log('[PurchaseStore] Found MEP data in key:', key);
                  break;
                }
              }
            }
          } else if (response.data.approved_procurement_purchases || response.data.estimation_pm_rejections) {
            // For project manager endpoint - combine approved purchases and estimation rejections
            const approved = response.data.approved_procurement_purchases || [];
            const rejections = response.data.estimation_pm_rejections || [];

            // Map rejections to include proper status fields for display
            const formattedRejections = rejections.map((rejection: any) => ({
              ...rejection,
              current_workflow_status: 'rejected',
              // DO NOT set pm_status here - keep existing PM status
              estimation_status: 'rejected',
              status: 'rejected',
              rejection_from: 'estimation',
              requires_pm_action: true
            }));

            purchaseData = [...approved, ...formattedRejections];
          } else if (response.data.purchase_details) {
            purchaseData = response.data.purchase_details;
          } else if (response.data.purchases) {
            purchaseData = response.data.purchases;
          } else if (Array.isArray(response.data)) {
            purchaseData = response.data;
          } else {
            // If none of the above, check for any array property
            const dataKeys = Object.keys(response.data);
            for (const key of dataKeys) {
              if (Array.isArray(response.data[key])) {
                purchaseData = response.data[key];
                break;
              }
            }
          }

          // Normalize materials field (only if we have data)
          if (purchaseData && purchaseData.length > 0) {
              purchaseData = purchaseData.map(purchase => {
            const materials = purchase.material_details || purchase.materials || [];

            // Normalize status field - check for current_status object
            let normalizedStatus = purchase.status;
            if (purchase.current_status && purchase.current_status.status) {
              normalizedStatus = purchase.current_status.status;
            }

            return {
              ...purchase,
              status: normalizedStatus, // Ensure status field is always available
              materials,
              total_cost: materials.reduce((sum: number, m: any) =>
                sum + (m.cost || 0) * (m.quantity || 1), 0
              ) || purchase.total_cost || 0,
              total_quantity: materials.reduce((sum: number, m: any) =>
                sum + (m.quantity || 0), 0
              ) || purchase.total_quantity || 0,
              material_count: materials.length || purchase.material_count || 0
            };
          });
          }

          // Only update if data has changed
          const currentPurchases = get().purchases;
          const hasChanges = JSON.stringify(currentPurchases) !== JSON.stringify(purchaseData);

          if (hasChanges) {
            // Get current user role
            const userRole = localStorage.getItem('userRole')?.toLowerCase() || '';

            // Check for new purchases that need attention
            const newPurchases = purchaseData.filter(p =>
              !currentPurchases.find(cp => cp.purchase_id === p.purchase_id)
            );

            // Check for status changes (rejections, reapprovals, etc.)
            const statusChangedPurchases = purchaseData.filter(p => {
              const currentPurchase = currentPurchases.find(cp => cp.purchase_id === p.purchase_id);
              if (!currentPurchase) return false;

              // Check if status has changed
              return currentPurchase.status !== p.status ||
                     currentPurchase.current_workflow_status !== p.current_workflow_status ||
                     currentPurchase.procurement_status !== p.procurement_status ||
                     currentPurchase.project_manager_status !== p.project_manager_status ||
                     currentPurchase.estimation_status !== p.estimation_status ||
                     currentPurchase.technical_director_status !== p.technical_director_status ||
                     currentPurchase.accounts_status !== p.accounts_status;
            });

            // Handle new purchases notifications
            if (newPurchases.length > 0 && currentPurchases.length > 0) {
              // Only send notifications if user is NOT a site/MEP supervisor (they are creators, not receivers)
              if (!userRole.includes('site') && !userRole.includes('mep') && !userRole.includes('supervisor')) {
                // Show toast notification
                toast.info(`${newPurchases.length} new purchase${newPurchases.length > 1 ? 's' : ''} received`);

                // Send browser notifications for each new purchase
                newPurchases.forEach(async (purchase) => {
                  // Request notification permission if not already granted
                  await requestNotificationPermission();

                  // Send browser notification using the purchase notification service
                  await sendPRNotification('submitted', {
                    documentId: `PR-${purchase.purchase_id}`,
                    submittedBy: purchase.requested_by || purchase.created_by || 'Unknown',
                    projectName: purchase.project_id?.toString() || 'Unknown Project',
                    nextRole: 'Procurement'
                  });
                });
              }
            }

            // Handle status change notifications (rejections, reapprovals)
            if (statusChangedPurchases.length > 0 && currentPurchases.length > 0) {
              statusChangedPurchases.forEach(async (purchase) => {
                const currentPurchase = currentPurchases.find(cp => cp.purchase_id === purchase.purchase_id);
                if (!currentPurchase) return;

                // Check for rejection
                if (purchase.status === 'rejected' && currentPurchase.status !== 'rejected') {
                  // Determine who rejected and who should be notified
                  let rejectedBy = 'Unknown';
                  let backToRole: 'site supervisor' | 'mep supervisor' | 'procurement' = 'procurement';

                  if (purchase.project_manager_rejection_reason) {
                    rejectedBy = 'Project Manager';
                    backToRole = 'procurement';
                  } else if (purchase.estimation_rejection_reason) {
                    rejectedBy = 'Estimation';
                    backToRole = 'procurement';
                  } else if (purchase.technical_director_rejection_reason) {
                    rejectedBy = 'Technical Director';
                    backToRole = 'procurement';
                  } else if (purchase.accounts_rejection_reason) {
                    rejectedBy = 'Accounts';
                    backToRole = 'procurement';
                  }

                  // Check if the original requester was MEP or Site supervisor
                  const requestedBy = purchase.requested_by?.toLowerCase() || '';
                  if (requestedBy.includes('mep')) {
                    backToRole = 'mep supervisor';
                  } else if (requestedBy.includes('site')) {
                    backToRole = 'site supervisor';
                  }

                  // Send rejection notification
                  await sendPRNotification('rejected', {
                    documentId: `PR-${purchase.purchase_id}`,
                    rejectedBy,
                    reason: purchase.project_manager_rejection_reason ||
                            purchase.estimation_rejection_reason ||
                            purchase.technical_director_rejection_reason ||
                            purchase.accounts_rejection_reason ||
                            'No reason provided',
                    projectName: purchase.project_id?.toString()
                  });
                }

                // Check for reapproval (status changed from rejected to pending/approved)
                // This happens when PR is edited and resubmitted after rejection
                if (currentPurchase.status === 'rejected' && purchase.status !== 'rejected') {
                  let nextRole = 'Procurement';

                  // Determine next role based on workflow status
                  if (purchase.current_workflow_status === 'project_manager') {
                    nextRole = 'Project Manager';
                  } else if (purchase.current_workflow_status === 'estimation') {
                    nextRole = 'Estimation';
                  } else if (purchase.current_workflow_status === 'technical_director') {
                    nextRole = 'Technical Director';
                  } else if (purchase.current_workflow_status === 'accounts') {
                    nextRole = 'Accounts';
                  } else if (purchase.current_workflow_status === 'procurement') {
                    // If workflow is at procurement and status is pending, it means resubmitted
                    // Need to notify next approver (usually Project Manager)
                    nextRole = 'Project Manager';
                  }

                  console.log(`PR ${purchase.purchase_id} resubmitted - notifying ${nextRole}`);

                  // Send reapproval notification
                  await sendPRNotification('reapproved', {
                    documentId: `PR-${purchase.purchase_id}`,
                    reapprovedBy: purchase.last_modified_by || purchase.requested_by || 'Unknown',
                    projectName: purchase.project_id?.toString(),
                    nextRole
                  });
                }

                // Also check if PR was just modified and email_sent flag was reset
                // This indicates a resubmission after editing
                if (currentPurchase.email_sent === true && purchase.email_sent === false &&
                    purchase.status === 'pending' && currentPurchase.status === 'rejected') {
                  console.log(`PR ${purchase.purchase_id} edited and ready for resubmission`);

                  // Determine who should be notified based on workflow
                  let nextRole = 'Project Manager'; // Default to PM for first approval

                  if (purchase.current_workflow_status === 'estimation') {
                    nextRole = 'Estimation';
                  } else if (purchase.current_workflow_status === 'technical_director') {
                    nextRole = 'Technical Director';
                  } else if (purchase.current_workflow_status === 'accounts') {
                    nextRole = 'Accounts';
                  }

                  // Send notification that PR is ready for re-review
                  await sendPRNotification('reapproved', {
                    documentId: `PR-${purchase.purchase_id}`,
                    reapprovedBy: purchase.last_modified_by || 'Procurement Team',
                    projectName: purchase.project_id?.toString(),
                    nextRole
                  });
                }
              });
            }

            set({
              purchases: purchaseData,
              lastFetchTime: new Date(),
              isLoading: false,
              error: null
            });
          } else {
            // Update last fetch time even if no changes
            set({ lastFetchTime: new Date() });
          }
        }
      } catch (error: any) {
        console.error('Error fetching purchases:', error);
        // Don't show error toast for background polling failures
        if (!get().lastFetchTime) {
          set({ error: error.message || 'Failed to fetch purchases' });
        }
      } finally {
        // Only set loading to false if it was true
        const currentStore = get();
        if (currentStore.isLoading) {
          set({ isLoading: false });
        }
      }
    },

    // Set purchases directly
    setPurchases: (purchases) => {
      set({
        purchases,
        lastFetchTime: new Date()
      });
    },

    // Update a single purchase
    updatePurchase: (purchaseId, updates) => {
      set((state) => ({
        purchases: state.purchases.map(p =>
          p.purchase_id === purchaseId ? { ...p, ...updates } : p
        )
      }));
    },

    // Add a new purchase
    addPurchase: (purchase) => {
      set((state) => ({
        purchases: [purchase, ...state.purchases]
      }));
      toast.success(`New purchase PR #${purchase.purchase_id} added`);
    },

    // Remove a purchase
    removePurchase: (purchaseId) => {
      set((state) => ({
        purchases: state.purchases.filter(p => p.purchase_id !== purchaseId)
      }));
    },

    // Toggle polling
    setPollingEnabled: (enabled) => {
      set({ isPollingEnabled: enabled });
    },

    // Set polling interval
    setPollingInterval: (interval) => {
      set({ pollingInterval: interval });
    },

    // Clear error
    clearError: () => {
      set({ error: null });
    },

    // Setup real-time subscription with instant updates
    setupRealtimeSubscription: () => {
      const state = get();
      if (state.subscriptionCleanup) {
        state.subscriptionCleanup();
      }

      // Subscribe to purchase_workflow_status changes for INSTANT updates
      const cleanup = subscribeToRealtime({
        table: 'purchase_workflow_status',
        event: '*',
        onInsert: (payload) => {
          // INSTANT refetch - no delay for real-time experience
          const userRole = localStorage.getItem('userRole');
          get().fetchPurchases(userRole || undefined);

          // Show notification for new data
          toast.success('New purchase data available!', {
            duration: 2000,
            position: 'top-right',
          });
        },
        onUpdate: (payload) => {
          // INSTANT refetch - no delay for real-time experience
          const userRole = localStorage.getItem('userRole');
          get().fetchPurchases(userRole || undefined);

          // Show notification for updated data
          toast.info('Purchase data updated!', {
            duration: 2000,
            position: 'top-right',
          });
        },
        onDelete: (payload) => {
          // INSTANT refetch for deletions too
          const userRole = localStorage.getItem('userRole');
          get().fetchPurchases(userRole || undefined);
        },
        invalidateKeys: [
          ['purchases'],
          ['dashboard', 'metrics'],
          ['approvals', 'pending'],
        ],
      });

      set({ subscriptionCleanup: cleanup });
    },

    // Cleanup real-time subscription
    cleanupRealtimeSubscription: () => {
      const state = get();
      if (state.subscriptionCleanup) {
        state.subscriptionCleanup();
        set({ subscriptionCleanup: null });
      }
    },

    // Get purchases filtered for a specific role
    getPurchasesForRole: (role: string) => {
      const purchases = get().purchases;
      const roleLower = role.toLowerCase();

      // Filter based on role-specific logic
      switch (roleLower) {
        case 'procurement':
          // All purchases visible to procurement (including TD rejected)
          return purchases;

        case 'projectmanager':
        case 'project manager':
        case 'project_manager':
          // Show purchases relevant to Project Manager
          return purchases.filter(p => {
            // Show if it has any PM-related status or is in PM workflow stage
            // Don't exclude based on rejections from other roles
            return p.project_manager_status ||
                   p.pm_status ||
                   p.procurement_status === 'approved' ||
                   p.current_workflow_status === 'project_manager' ||
                   p.rejection_from === 'estimation' || // Show rejections that came back
                   p.status_receiver === 'projectManager' || // Show if awaiting PM action
                   true; // For now, show all to ensure nothing is missed
          });

        case 'estimation':
          // Show purchases relevant to Estimation
          return purchases.filter(p => {
            return p.estimation_status ||
                   p.project_manager_status === 'approved' ||
                   p.pm_status === 'approved' ||
                   p.current_workflow_status === 'estimation' ||
                   true; // For now, show all to ensure nothing is missed
          });

        case 'technicaldirector':
        case 'technical director':
        case 'technical_director':
          // Show purchases relevant to Technical Director
          return purchases.filter(p => {
            return p.technical_director_status ||
                   p.estimation_status === 'approved' ||
                   p.current_workflow_status === 'technical_director' ||
                   true; // For now, show all to ensure nothing is missed
          });

        case 'accounts':
          // Show purchases relevant to Accounts
          return purchases.filter(p => {
            return p.accounts_status ||
                   p.technical_director_status === 'approved' ||
                   p.current_workflow_status === 'accounts' ||
                   p.accounts_acknowledgement !== undefined ||
                   true; // For now, show all to ensure nothing is missed
          });

        case 'sitesupervisor':
        case 'site supervisor':
        case 'site_supervisor':
          // Only show purchases created by site supervisor, exclude MEP supervisor PRs
          return purchases.filter(p => {
            const requestedBy = p.requested_by?.toLowerCase() || '';
            const createdBy = p.created_by?.toLowerCase() || '';

            // Include if requested by Site supervisor
            const isSiteRequest = requestedBy.includes('site supervisor') ||
                                createdBy.includes('site supervisor') ||
                                requestedBy.includes('sitesupervisor') ||
                                createdBy.includes('sitesupervisor');

            // Exclude if requested by MEP supervisor
            const isMepRequest = requestedBy.includes('mep') ||
                               createdBy.includes('mep') ||
                               requestedBy.includes('mepsupervisor') ||
                               createdBy.includes('mepsupervisor');

            return isSiteRequest && !isMepRequest;
          });

        case 'mepsupervisor':
        case 'mep supervisor':
        case 'mep_supervisor':
          // All purchases from /mep_purchases endpoint are MEP purchases, no filtering needed
          return purchases;

        default:
          return purchases;
      }
    },
  }))
);

// Setup polling mechanism with aggressive real-time updates
let pollingIntervalId: NodeJS.Timeout | null = null;

export const startPolling = (role?: string) => {
  const store = usePurchaseStore.getState();

  // Clear existing interval
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
  }

  // Ensure proper role mapping for MEP supervisor
  let mappedRole = role;
  if (role) {
    const roleLower = role.toLowerCase();
    if (roleLower.includes('mep')) {
      mappedRole = 'mepsupervisor';
    } else if (roleLower === 'procurement') {
      mappedRole = 'procurement';
    }
  }

  // Start new polling interval for REAL-TIME updates
  if (store.isPollingEnabled) {
    // Initial fetch with mapped role
    store.fetchPurchases(mappedRole);

    // Setup real-time subscription for instant updates
    store.setupRealtimeSubscription();

    // Setup aggressive polling (every 2 seconds when tab is visible)
    pollingIntervalId = setInterval(() => {
      const currentStore = usePurchaseStore.getState();
      // Always poll when tab is visible - no conditions
      if (document.visibilityState === 'visible') {
        currentStore.fetchPurchases(mappedRole);
      }
    }, store.pollingInterval);

  }
};

export const stopPolling = () => {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
};

// Auto-refresh INSTANTLY when tab becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // INSTANT refresh when tab becomes active - no delays!
    const store = usePurchaseStore.getState();
    const userRole = localStorage.getItem('userRole');


    // Fix role mapping - localStorage might have different format
    let mappedRole = userRole;
    if (userRole) {
      // Map common role variations
      if (userRole.toLowerCase().includes('mep')) {
        mappedRole = 'mepsupervisor';
      } else if (userRole.toLowerCase().includes('site') && !userRole.toLowerCase().includes('mep')) {
        mappedRole = 'sitesupervisor';
      } else if (userRole.toLowerCase().includes('procurement')) {
        mappedRole = 'procurement';
      } else if (userRole.toLowerCase().includes('project')) {
        mappedRole = 'projectmanager';
      } else if (userRole.toLowerCase().includes('estimation')) {
        mappedRole = 'estimation';
      } else if (userRole.toLowerCase().includes('technical')) {
        mappedRole = 'technicaldirector';
      } else if (userRole.toLowerCase().includes('account')) {
        mappedRole = 'accounts';
      } else {
        // Keep original role if no mapping found
        mappedRole = userRole;
      }
    }

    if (mappedRole) {
      store.fetchPurchases(mappedRole);
    }
  }
});

export default usePurchaseStore;