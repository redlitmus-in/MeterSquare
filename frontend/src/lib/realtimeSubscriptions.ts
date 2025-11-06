import { supabase } from '@/lib/supabase';
import { invalidateQueries } from '@/lib/queryClient';
import { toast } from 'sonner';

// Types for subscription channels
type SubscriptionChannel = 'purchases' | 'tasks' | 'notifications' | 'materials' | 'projects' | 'boqs' | 'boq_details' | 'change_requests';

// Store active subscriptions
const activeSubscriptions = new Map<SubscriptionChannel, any>();

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
        console.log(`${table} change received:`, payload);

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
          console.log('Purchase change received:', payload);

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
          console.log('Task change received:', payload);

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
          console.log('Material change received:', payload);

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
          console.log('New notification:', payload);

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
          console.log('Project change received:', payload);

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
  try {
    const subscription = supabase
      .channel('boq-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'boq',
        },
        (payload) => {
          console.log('BOQ change received:', payload);

          // Invalidate all BOQ-related queries for ALL roles
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
      .subscribe();

    activeSubscriptions.set('boqs', subscription);
  } catch (error) {
    console.error('Failed to subscribe to BOQs:', error);
  }
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
          console.log('BOQ details change received:', payload);

          // Invalidate BOQ details queries
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
          console.log('Change request received:', payload);

          // Invalidate change request queries for all roles
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
  activeSubscriptions.forEach((subscription, channel) => {
    try {
      supabase.removeChannel(subscription);
      console.log(`Cleaned up subscription: ${channel}`);
    } catch (error) {
      console.error(`Failed to cleanup subscription ${channel}:`, error);
    }
  });
  activeSubscriptions.clear();
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