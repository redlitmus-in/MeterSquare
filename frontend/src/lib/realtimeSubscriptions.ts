import { supabase } from '@/lib/supabase';
import { invalidateQueries } from '@/lib/queryClient';
// NOTE: Toast imports removed - Supabase realtime broadcasts to ALL users.
// Toast notifications are handled by Socket.IO (realtimeNotificationHub)
// which sends targeted notifications only to the correct users.
import { useRealtimeUpdateStore } from '@/store/realtimeUpdateStore';

// Types for subscription channels
type SubscriptionChannel = 'purchases' | 'tasks' | 'notifications' | 'materials' | 'projects' | 'boqs' | 'boq_details' | 'boq_internal_revisions' | 'change_requests';

// Store active subscriptions
const activeSubscriptions = new Map<SubscriptionChannel, any>();

// Track if subscriptions are already initialized
let subscriptionsInitialized = false;

// Track if subscriptions are intentionally paused (to prevent reconnection loops)
let isIntentionallyPaused = false;

// Interface for custom subscription configuration
interface SubscribeToRealtimeConfig {
  table: string;
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  filter?: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  invalidateKeys?: string[][];
}

/**
 * Subscribe to a specific table with custom handlers
 */
export const subscribeToRealtime = (config: SubscribeToRealtimeConfig) => {
  const { table, event = '*', filter, onInsert, onUpdate, onDelete, invalidateKeys } = config;

  if (!supabase) {
    console.warn('Supabase client not initialized');
    return () => {};
  }

  const channelName = `custom-${table}-${Date.now()}`;

  const subscription = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event,
        schema: 'public',
        table,
        ...(filter && { filter }),
      },
      (payload) => {
        // Invalidate queries if keys provided
        if (invalidateKeys) {
          invalidateKeys.forEach(keys => {
            invalidateQueries(keys);
          });
        }

        // Call appropriate handler based on event type
        if (payload.eventType === 'INSERT' && onInsert) {
          onInsert(payload);
        } else if (payload.eventType === 'UPDATE' && onUpdate) {
          onUpdate(payload);
        } else if (payload.eventType === 'DELETE' && onDelete) {
          onDelete(payload);
        }
      }
    )
    .subscribe();

  // Return cleanup function
  return () => {
    supabase.removeChannel(subscription);
  };
};

/**
 * Setup realtime subscriptions for data updates
 */
export const setupRealtimeSubscriptions = (userId?: string) => {
  if (!supabase) {
    console.warn('Supabase client not initialized, skipping realtime subscriptions');
    return () => {}; // Return empty function for cleanup
  }

  // Prevent duplicate subscriptions
  if (subscriptionsInitialized) {
    if (import.meta.env.DEV) {
      console.log('⚠️ Subscriptions already initialized, skipping duplicate setup');
    }
    return cleanupSubscriptions;
  }

  if (import.meta.env.DEV) {
    console.log('🚀 Setting up real-time subscriptions...');
  }
  subscriptionsInitialized = true;

  // Clean up existing subscriptions
  cleanupSubscriptions();

  // Subscribe to purchase updates
  subscribeToPurchases();

  // Subscribe to task updates
  subscribeToTasks();

  // Subscribe to material updates
  subscribeToMaterials();

  // Subscribe to BOQ updates (CRITICAL for real-time role updates)
  subscribeToBOQs();

  // Subscribe to BOQ details updates
  subscribeToBOQDetails();

  // Subscribe to BOQ internal revisions (for internal revision workflow)
  subscribeToBOQInternalRevisions();

  // Subscribe to change request updates
  subscribeToChangeRequests();

  // Subscribe to project updates if user is logged in
  if (userId) {
    subscribeToUserNotifications(userId);
  }

  // Return cleanup function
  return cleanupSubscriptions;
};

/**
 * Subscribe to purchase table changes
 */
const subscribeToPurchases = () => {
  try {
    const subscription = supabase
      .channel('purchase-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchases',
        },
        (payload) => {
          // Invalidate purchase-related queries
          invalidateQueries(['purchases']);
          invalidateQueries(['purchase', payload.new?.purchase_id]);

          // NOTE: DO NOT show toasts here - broadcasts to ALL users!
          // Socket.IO handles targeted notifications
          if (import.meta.env.DEV && payload.eventType === 'INSERT') {
            console.log(`[RealtimeSubscriptions] New purchase request: ${payload.new?.purchase_id}`);
          }
        }
      )
      .subscribe();

    activeSubscriptions.set('purchases', subscription);
  } catch (error) {
    console.error('Failed to subscribe to purchases:', error);
  }
};

/**
 * Subscribe to task table changes
 */
const subscribeToTasks = () => {
  try {
    const subscription = supabase
      .channel('task-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        (payload) => {
          // Invalidate task-related queries
          invalidateQueries(['tasks']);
          invalidateQueries(['task', payload.new?.task_id]);

          // NOTE: DO NOT show toasts here - broadcasts to ALL users!
          // Socket.IO handles targeted notifications
          if (import.meta.env.DEV) {
            console.log(`[RealtimeSubscriptions] Task ${payload.eventType}: ${payload.new?.task_id}`);
          }
        }
      )
      .subscribe();

    activeSubscriptions.set('tasks', subscription);
  } catch (error) {
    console.error('Failed to subscribe to tasks:', error);
  }
};

/**
 * Subscribe to material table changes
 */
const subscribeToMaterials = () => {
  try {
    const subscription = supabase
      .channel('material-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'materials',
        },
        (payload) => {
          // Invalidate material-related queries
          invalidateQueries(['materials']);
          invalidateQueries(['material', payload.new?.material_id]);
        }
      )
      .subscribe();

    activeSubscriptions.set('materials', subscription);
  } catch (error) {
    console.error('Failed to subscribe to materials:', error);
  }
};

/**
 * Subscribe to user-specific notifications
 */
const subscribeToUserNotifications = (userId: string) => {
  try {
    const subscription = supabase
      .channel(`user-notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // NOTE: DO NOT show toasts here - Socket.IO (realtimeNotificationHub) handles this
          // to avoid duplicate notifications. This just refreshes the notification query.

          // Invalidate notifications query so panel updates
          invalidateQueries(['notifications']);

          if (import.meta.env.DEV) {
            console.log(`[RealtimeSubscriptions] Notification received for user: ${payload.new?.id}`);
          }
        }
      )
      .subscribe();

    activeSubscriptions.set('notifications', subscription);
  } catch (error) {
    console.error('Failed to subscribe to notifications:', error);
  }
};

/**
 * Subscribe to project updates
 */
const subscribeToProjects = () => {
  try {
    const subscription = supabase
      .channel('project-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
        },
        (payload) => {
          // Invalidate project-related queries
          invalidateQueries(['projects']);
          invalidateQueries(['project', payload.new?.project_id]);
        }
      )
      .subscribe();

    activeSubscriptions.set('projects', subscription);
  } catch (error) {
    console.error('Failed to subscribe to projects:', error);
  }
};

/**
 * Subscribe to BOQ table changes - CRITICAL for real-time role updates
 * Fixes issue where TD approval doesn't instantly show in Estimator's approved tab
 */
const subscribeToBOQs = () => {
  let retryCount = 0;
  const MAX_RETRIES = 5; // Increased from 3 to 5
  let retryTimeout: NodeJS.Timeout;

  const createSubscription = () => {
    try {
      // Remove existing subscription first to prevent duplicates
      const existing = activeSubscriptions.get('boqs');
      if (existing) {
        supabase.removeChannel(existing);
        activeSubscriptions.delete('boqs');
      }

      // Use unique channel name to prevent conflicts
      const channelName = `boq-changes-${Date.now()}`;
      const subscription = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'boq',
          },
          (payload) => {
            if (import.meta.env.DEV) {
              console.log('🔥 BOQ CHANGE DETECTED:', payload.eventType, payload);
            }

            // ✅ TRIGGER STORE UPDATE - This makes pages refetch data!
            useRealtimeUpdateStore.getState().triggerBOQUpdate(payload);

            // Invalidate all BOQ-related queries for ALL roles (for React Query pages)
            invalidateQueries(['boqs']);
            invalidateQueries(['boq', payload.new?.boq_id || payload.old?.boq_id]);
            invalidateQueries(['td_boqs']); // Technical Director BOQs
            invalidateQueries(['pm_boqs']); // Project Manager BOQs
            invalidateQueries(['estimator_boqs']); // Estimator BOQs
            invalidateQueries(['project-boqs']); // Project-specific BOQs

            // Show notification based on status change
            const newStatus = payload.new?.status;
            const oldStatus = payload.old?.status;

            // NOTE: DO NOT show toasts here!
            // Supabase realtime broadcasts to ALL users, not just the relevant ones.
            // Toast notifications are handled by Socket.IO (realtimeNotificationHub)
            // which sends targeted notifications only to the correct users.
            // This subscription is ONLY for silently refreshing data in the background.

            if (payload.eventType === 'UPDATE' && newStatus !== oldStatus) {
              // Status changed - silently trigger data refresh
              // Toast notification will come from Socket.IO to the correct user
              if (import.meta.env.DEV) {
                console.log(`[RealtimeSubscriptions] BOQ ${payload.new?.boq_id} status changed: ${oldStatus} -> ${newStatus}`);
              }
            } else if (payload.eventType === 'INSERT') {
              // New BOQ created - silently trigger data refresh
              // Toast notification will come from Socket.IO to the correct user
              if (import.meta.env.DEV) {
                console.log(`[RealtimeSubscriptions] New BOQ created: ${payload.new?.boq_id}`);
              }
            }
          }
        )
        .subscribe((status, err) => {
          // Handle subscription being closed and reconnect
          if (status === 'CLOSED') {
            // Don't reconnect if intentionally paused
            if (isIntentionallyPaused) {
              return;
            }
            // Only reconnect if we haven't exceeded retries
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              if (retryTimeout) clearTimeout(retryTimeout);
              retryTimeout = setTimeout(() => {
                // Double-check we're still not paused before reconnecting
                if (isIntentionallyPaused) return;
                createSubscription();
              }, 3000);
            }
            return;
          }

          // Handle subscription failures and retry
          if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            if (import.meta.env.DEV) {
              console.error(`❌ BOQ subscription ${status}`, err);
            }

            if (retryCount < MAX_RETRIES) {
              retryCount++;
              const backoffDelay = Math.min(5000 * retryCount, 30000); // Exponential backoff max 30s
              if (retryTimeout) clearTimeout(retryTimeout);
              retryTimeout = setTimeout(() => {
                if (isIntentionallyPaused) return;
                supabase.removeChannel(subscription);
                createSubscription();
              }, backoffDelay);
            }
          } else if (status === 'SUBSCRIBED') {
            retryCount = 0; // Reset retry count on success
            if (retryTimeout) clearTimeout(retryTimeout);
          }
        });

      activeSubscriptions.set('boqs', subscription);
    } catch (error) {
      console.error('Failed to subscribe to BOQs:', error);
    }
  };

  createSubscription();
};

/**
 * Subscribe to BOQ details table changes
 */
const subscribeToBOQDetails = () => {
  try {
    const subscription = supabase
      .channel('boq-details-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'boq_details',
        },
        (payload) => {
          // ✅ TRIGGER STORE UPDATE
          useRealtimeUpdateStore.getState().triggerBOQDetailsUpdate(payload);

          // Invalidate BOQ details queries (for React Query pages)
          invalidateQueries(['boq-details']);
          invalidateQueries(['boq-details', payload.new?.boq_id || payload.old?.boq_id]);
        }
      )
      .subscribe();

    activeSubscriptions.set('boq_details', subscription);
  } catch (error) {
    console.error('Failed to subscribe to BOQ details:', error);
  }
};

/**
 * Subscribe to BOQ internal revisions table changes
 * This ensures TD and Estimator see internal revision updates in real-time
 */
const subscribeToBOQInternalRevisions = () => {
  let retryCount = 0;
  const MAX_RETRIES = 3;

  const createSubscription = () => {
    try {
      // Remove existing subscription first to prevent duplicates
      const existing = activeSubscriptions.get('boq_internal_revisions');
      if (existing) {
        supabase.removeChannel(existing);
        activeSubscriptions.delete('boq_internal_revisions');
      }

      // Use unique channel name to prevent conflicts
      const channelName = `boq-internal-revision-changes-${Date.now()}`;
      const subscription = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'boq_internal_revisions',
          },
          (payload) => {
            if (import.meta.env.DEV) {
              console.log('🔄 Internal revision change detected:', payload.eventType);
            }

            // ✅ TRIGGER STORE UPDATE - This makes InternalRevisionTimeline refetch!
            useRealtimeUpdateStore.getState().triggerBOQUpdate(payload);

            // Invalidate BOQ queries since internal revisions affect BOQ state
            invalidateQueries(['boqs']);
            invalidateQueries(['boq', payload.new?.boq_id || payload.old?.boq_id]);

            // NOTE: DO NOT show toasts here - broadcasts to ALL users!
            // Socket.IO handles targeted notifications
            if (import.meta.env.DEV && payload.eventType === 'INSERT') {
              console.log(`[RealtimeSubscriptions] Internal revision ${payload.new?.action_type}: BOQ ${payload.new?.boq_id}`);
            }
          }
        )
        .subscribe((status, err) => {
          // Handle subscription being closed and reconnect
          if (status === 'CLOSED') {
            // Don't reconnect if intentionally paused
            if (isIntentionallyPaused) {
              return;
            }
            // Only reconnect if we haven't exceeded retries
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              setTimeout(() => {
                // Double-check we're still not paused before reconnecting
                if (isIntentionallyPaused) return;
                createSubscription();
              }, 3000);
            }
            return;
          }

          // Handle subscription failures and retry
          if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            if (import.meta.env.DEV) {
              console.error(`❌ Internal Revisions subscription ${status}`, err);
            }

            if (retryCount < MAX_RETRIES) {
              retryCount++;
              setTimeout(() => {
                if (isIntentionallyPaused) return;
                supabase.removeChannel(subscription);
                createSubscription();
              }, 5000);
            }
          } else if (status === 'SUBSCRIBED') {
            retryCount = 0;
          }
        });

      activeSubscriptions.set('boq_internal_revisions' as SubscriptionChannel, subscription);
    } catch (error) {
      console.error('Failed to subscribe to BOQ internal revisions:', error);
    }
  };

  createSubscription();
};

/**
 * Subscribe to change requests table changes
 */
const subscribeToChangeRequests = () => {
  try {
    const subscription = supabase
      .channel('change-request-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'change_requests',
        },
        (payload) => {
          // ✅ TRIGGER STORE UPDATE - This makes pages refetch data!
          useRealtimeUpdateStore.getState().triggerChangeRequestUpdate(payload);

          // Invalidate change request queries for all roles (for React Query pages)
          invalidateQueries(['change-requests']);
          invalidateQueries(['change_requests']);
          invalidateQueries(['change-request', payload.new?.request_id || payload.old?.request_id]);
          invalidateQueries(['vendor-approvals']); // TD vendor approvals

          // NOTE: DO NOT show toasts here - broadcasts to ALL users!
          // Socket.IO handles targeted notifications
          if (import.meta.env.DEV) {
            console.log(`[RealtimeSubscriptions] Change request ${payload.eventType}: ${payload.new?.cr_id}`);
          }
        }
      )
      .subscribe();

    activeSubscriptions.set('change_requests', subscription);
  } catch (error) {
    console.error('Failed to subscribe to change requests:', error);
  }
};

/**
 * Clean up all active subscriptions
 */
export const cleanupSubscriptions = () => {
  if (import.meta.env.DEV) {
    console.log('🧹 Cleaning up all subscriptions...');
  }
  isIntentionallyPaused = true; // Prevent reconnection attempts during cleanup
  activeSubscriptions.forEach((subscription, channel) => {
    try {
      supabase.removeChannel(subscription);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error(`Failed to cleanup subscription ${channel}:`, error);
      }
    }
  });
  activeSubscriptions.clear();
  subscriptionsInitialized = false; // Reset flag so subscriptions can be recreated
  isIntentionallyPaused = false; // Reset after cleanup
};

/**
 * Pause all subscriptions (useful when app goes to background)
 */
export const pauseSubscriptions = () => {
  isIntentionallyPaused = true;
  activeSubscriptions.forEach((subscription) => {
    try {
      subscription.unsubscribe();
    } catch (error) {
      console.error('Failed to pause subscription:', error);
    }
  });
};

/**
 * Resume all subscriptions
 */
export const resumeSubscriptions = () => {
  isIntentionallyPaused = false;
  activeSubscriptions.forEach((subscription) => {
    try {
      subscription.subscribe();
    } catch (error) {
      console.error('Failed to resume subscription:', error);
    }
  });
};

// Clean up on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupSubscriptions);

  // NOTE: Removed visibility change handler as it was causing reconnection loops.
  // Supabase realtime handles connection management internally and will
  // automatically reconnect when needed. Manual pause/resume was triggering
  // CLOSED status which then triggered reconnection logic, creating infinite loops.
}