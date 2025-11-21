import { supabase } from '@/lib/supabase';
import { invalidateQueries } from '@/lib/queryClient';
import { toast } from 'sonner';
import { useRealtimeUpdateStore } from '@/store/realtimeUpdateStore';

// Types for subscription channels
type SubscriptionChannel = 'purchases' | 'tasks' | 'notifications' | 'materials' | 'projects' | 'boqs' | 'boq_details' | 'boq_internal_revisions' | 'change_requests';

// Store active subscriptions
const activeSubscriptions = new Map<SubscriptionChannel, any>();

// Track if subscriptions are already initialized
let subscriptionsInitialized = false;

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
    console.log('⚠️ Subscriptions already initialized, skipping duplicate setup');
    return cleanupSubscriptions;
  }

  console.log('🚀 Setting up real-time subscriptions...');
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

          // Show notification based on event type
          if (payload.eventType === 'INSERT') {
            toast.success('New purchase request created');
          } else if (payload.eventType === 'UPDATE') {
            toast.info('Purchase request updated');
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

          // Show notification for task updates
          if (payload.eventType === 'INSERT') {
            toast.success('New task assigned');
          } else if (payload.eventType === 'UPDATE' && payload.new?.status === 'completed') {
            toast.success('Task completed');
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
          // Show the notification
          const notification = payload.new;
          if (notification?.message) {
            toast.info(notification.message);
          }

          // Invalidate notifications query
          invalidateQueries(['notifications']);
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
  const MAX_RETRIES = 3;

  const createSubscription = () => {
    try {
      // Remove existing subscription first to prevent duplicates
      const existing = activeSubscriptions.get('boqs');
      if (existing) {
        console.log('🧹 Removing existing BOQ subscription before recreating...');
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
            console.log('🔥 BOQ CHANGE DETECTED:', payload.eventType, payload);

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

            if (payload.eventType === 'UPDATE' && newStatus !== oldStatus) {
              // Status changed - show appropriate notification
              if (newStatus === 'PM_Approved') {
                toast.success('BOQ approved by PM');
              } else if (newStatus === 'Approved' || newStatus === 'TD_Approved') {
                toast.success('BOQ approved by Technical Director');
              } else if (newStatus === 'Pending_TD_Approval') {
                toast.info('BOQ sent to Technical Director for approval');
              } else if (newStatus === 'Client_Confirmed') {
                toast.success('BOQ confirmed by client');
              } else if (newStatus === 'Rejected') {
                toast.error('BOQ rejected');
              }
            } else if (payload.eventType === 'INSERT') {
              toast.info('New BOQ created');
            }
          }
        )
        .subscribe((status, err) => {
          console.log('📡 BOQ subscription status:', status, err);

          // Handle subscription being closed and reconnect
          if (status === 'CLOSED') {
            console.warn('⚠️ BOQ subscription was closed, reconnecting in 3 seconds...');
            // Only reconnect if we haven't exceeded retries
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              setTimeout(() => {
                console.log(`🔄 Reconnecting BOQ subscription (attempt ${retryCount}/${MAX_RETRIES})...`);
                createSubscription();
              }, 3000);
            } else {
              console.error('❌ BOQ subscription closed too many times. Stopping reconnection attempts.');
            }
            return;
          }

          // Handle subscription failures and retry
          if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            console.error(`❌ BOQ subscription ${status}`, err);
            console.error('Debug info:', {
              supabaseUrl: supabase.supabaseUrl,
              channel: subscription.topic,
              error: err
            });

            if (retryCount < MAX_RETRIES) {
              retryCount++;
              console.log(`🔄 Retrying BOQ subscription (${retryCount}/${MAX_RETRIES}) in 5 seconds...`);
              setTimeout(() => {
                supabase.removeChannel(subscription);
                createSubscription();
              }, 5000);
            } else {
              console.error('❌ BOQ subscription failed after max retries.');
              console.error('Possible fixes:');
              console.error('1. Check if RLS is enabled on "boq" table - disable it or add SELECT policy');
              console.error('2. Run this SQL: ALTER PUBLICATION supabase_realtime ADD TABLE boq;');
              console.error('3. Check Supabase Dashboard > Database > Replication');
              toast.error('Real-time updates unavailable. Please refresh manually.');
            }
          } else if (status === 'SUBSCRIBED') {
            // Removed verbose log - was causing console spam
            retryCount = 0; // Reset retry count on success
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
        console.log('🧹 Removing existing Internal Revisions subscription before recreating...');
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
            console.log('🔄 Internal revision change detected:', payload.eventType);

            // ✅ TRIGGER STORE UPDATE - This makes InternalRevisionTimeline refetch!
            useRealtimeUpdateStore.getState().triggerBOQUpdate(payload);

            // Invalidate BOQ queries since internal revisions affect BOQ state
            invalidateQueries(['boqs']);
            invalidateQueries(['boq', payload.new?.boq_id || payload.old?.boq_id]);

            // Show notification based on event
            if (payload.eventType === 'INSERT') {
              const actorRole = payload.new?.actor_role;
              if (actorRole === 'estimator') {
                toast.info('New internal revision created');
              } else if (actorRole === 'technical_director') {
                const actionType = payload.new?.action_type;
                if (actionType === 'APPROVED') {
                  toast.success('Internal revision approved');
                } else if (actionType === 'REJECTED') {
                  toast.error('Internal revision rejected');
                }
              }
            }
          }
        )
        .subscribe((status, err) => {
          console.log('📡 BOQ Internal Revisions subscription status:', status, err);

          // Handle subscription being closed and reconnect
          if (status === 'CLOSED') {
            console.warn('⚠️ Internal Revisions subscription was closed, reconnecting in 3 seconds...');
            // Only reconnect if we haven't exceeded retries
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              setTimeout(() => {
                console.log(`🔄 Reconnecting Internal Revisions subscription (attempt ${retryCount}/${MAX_RETRIES})...`);
                createSubscription();
              }, 3000);
            } else {
              console.error('❌ Internal Revisions subscription closed too many times. Stopping reconnection attempts.');
            }
            return;
          }

          // Handle subscription failures and retry
          if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
            console.error(`❌ Internal Revisions subscription ${status}`, err);
            console.error('Debug info:', {
              supabaseUrl: supabase.supabaseUrl,
              channel: subscription.topic,
              error: err
            });

            if (retryCount < MAX_RETRIES) {
              retryCount++;
              console.log(`🔄 Retrying Internal Revisions subscription (${retryCount}/${MAX_RETRIES}) in 5 seconds...`);
              setTimeout(() => {
                supabase.removeChannel(subscription);
                createSubscription();
              }, 5000);
            } else {
              console.error('❌ Internal Revisions subscription failed after max retries.');
              console.error('Possible fixes:');
              console.error('1. Check if RLS is enabled on "boq_internal_revisions" table');
              console.error('2. Run this SQL: ALTER PUBLICATION supabase_realtime ADD TABLE boq_internal_revisions;');
              console.error('3. Run this SQL: ALTER TABLE boq_internal_revisions DISABLE ROW LEVEL SECURITY;');
            }
          } else if (status === 'SUBSCRIBED') {
            // Removed verbose log - was causing console spam
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

          // Show notification based on event
          if (payload.eventType === 'INSERT') {
            toast.info('New change request created');
          } else if (payload.eventType === 'UPDATE') {
            const newStatus = payload.new?.status;
            const oldStatus = payload.old?.status;

            if (newStatus !== oldStatus) {
              if (newStatus === 'approved') {
                toast.success('Change request approved');
              } else if (newStatus === 'rejected') {
                toast.error('Change request rejected');
              }
            }
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
  console.log('🧹 Cleaning up all subscriptions...');
  activeSubscriptions.forEach((subscription, channel) => {
    try {
      supabase.removeChannel(subscription);
    } catch (error) {
      console.error(`Failed to cleanup subscription ${channel}:`, error);
    }
  });
  activeSubscriptions.clear();
  subscriptionsInitialized = false; // Reset flag so subscriptions can be recreated
};

/**
 * Pause all subscriptions (useful when app goes to background)
 */
export const pauseSubscriptions = () => {
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

  // Handle visibility change (pause/resume when tab is hidden/visible)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseSubscriptions();
    } else {
      resumeSubscriptions();
    }
  });
}