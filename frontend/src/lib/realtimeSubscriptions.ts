import { supabase } from '@/lib/supabase';
import { invalidateQueries } from '@/lib/queryClient';
import { toast } from 'sonner';

// Types for subscription channels
type SubscriptionChannel = 'purchases' | 'tasks' | 'notifications' | 'materials' | 'projects';

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