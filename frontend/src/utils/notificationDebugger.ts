/**
 * Notification System Debugger
 * Use this in browser console to test notifications
 */

import { useNotificationStore } from '@/store/notificationStore';
import { NotificationData } from '@/services/notificationService';

// Make debug functions available globally in development
if (typeof window !== 'undefined' && import.meta.env.DEV) {

  // Test notification creation
  (window as any).testNotification = (type: string) => {
    const store = useNotificationStore.getState();

    const testCases: Record<string, Partial<NotificationData>> = {
      // BOQ Workflows
      'boq_pending': {
        title: 'New BOQ for Approval',
        message: 'BOQ #726 for Dubai Mall requires your approval',
        type: 'approval',
        priority: 'high',
        category: 'approval',
        metadata: { boq_id: '726', project: 'Dubai Mall', sender: 'John Estimator' }
      },
      'boq_approved': {
        title: 'BOQ Approved by Technical Director',
        message: 'BOQ #726 for Dubai Mall has been approved',
        type: 'success',
        priority: 'medium',
        category: 'approval',
        metadata: { boq_id: '726', project: 'Dubai Mall' }
      },
      'boq_rejected': {
        title: 'BOQ Rejected',
        message: 'BOQ #726 has been rejected. Please review and resubmit.',
        type: 'error',
        priority: 'high',
        category: 'approval',
        metadata: { boq_id: '726', reason: 'Pricing issues' }
      },
      'client_approved': {
        title: 'BOQ Approved by Client',
        message: 'Client ABC has approved BOQ #726 for Dubai Mall',
        type: 'success',
        priority: 'high',
        category: 'approval',
        metadata: { boq_id: '726', client: 'Client ABC', project: 'Dubai Mall' }
      },
      'client_rejected': {
        title: 'BOQ Rejected by Client',
        message: 'Client ABC has rejected BOQ #726. Reason: Budget concerns',
        type: 'error',
        priority: 'urgent',
        category: 'approval',
        metadata: { boq_id: '726', client: 'Client ABC', reason: 'Budget concerns' }
      },

      // Change Request Workflows
      'cr_pending': {
        title: 'New Change Request',
        message: 'Change request CR-123 from PM for Dubai Mall',
        type: 'approval',
        priority: 'high',
        category: 'change_request',
        metadata: { cr_id: '123', project: 'Dubai Mall', sender: 'PM Name' }
      },
      'cr_approved': {
        title: 'Change Request Approved',
        message: 'CR-123 for Dubai Mall has been approved',
        type: 'success',
        priority: 'medium',
        category: 'change_request',
        metadata: { cr_id: '123', project: 'Dubai Mall' }
      },

      // Vendor Workflows
      'vendor_new': {
        title: 'New Vendor Registration',
        message: 'Vendor ABC Trading registered by Buyer',
        type: 'approval',
        priority: 'medium',
        category: 'vendor',
        metadata: { vendor_id: '456', vendor: 'ABC Trading' }
      },
      'vendor_approved': {
        title: 'Vendor Approved',
        message: 'Vendor ABC Trading has been approved',
        type: 'success',
        priority: 'medium',
        category: 'vendor',
        metadata: { vendor_id: '456', vendor: 'ABC Trading' }
      },
      'vendor_selected': {
        title: 'Vendor Selected for Change Request',
        message: 'Vendor ABC Trading selected for CR-123',
        type: 'info',
        priority: 'medium',
        category: 'vendor',
        metadata: { cr_id: '123', vendor: 'ABC Trading' }
      },

      // Purchase Order Workflows
      'po_pending': {
        title: 'Purchase Order for Approval',
        message: 'PO #789 for AED 50,000 from Buyer',
        type: 'approval',
        priority: 'high',
        category: 'procurement',
        metadata: { po_id: '789', amount: 50000 }
      },
      'po_approved': {
        title: 'Purchase Order Approved',
        message: 'PO #789 has been approved',
        type: 'success',
        priority: 'medium',
        category: 'procurement',
        metadata: { po_id: '789' }
      },

      // Material Workflows
      'material_request': {
        title: 'Extra Material Request',
        message: 'PM requested 100 units of Cement',
        type: 'approval',
        priority: 'high',
        category: 'material',
        metadata: { request_id: '321', material: 'Cement', quantity: 100 }
      },
      'material_approved': {
        title: 'Extra Material Approved',
        message: 'Your request for 100 units of Cement approved',
        type: 'success',
        priority: 'medium',
        category: 'material',
        metadata: { request_id: '321', material: 'Cement' }
      },
      'low_stock': {
        title: 'Low Stock Alert',
        message: 'Steel Rods stock below minimum level',
        type: 'alert',
        priority: 'urgent',
        category: 'production',
        metadata: { material_id: '555', material: 'Steel Rods' }
      },

      // Project Assignment
      'pm_assigned': {
        title: 'Project Assigned to You',
        message: 'You have been assigned as PM for Dubai Mall',
        type: 'info',
        priority: 'high',
        category: 'project',
        metadata: { project_id: '999', project: 'Dubai Mall' }
      },
      'se_assigned': {
        title: 'Assigned to Project as Site Engineer',
        message: 'You have been assigned to Dubai Mall',
        type: 'info',
        priority: 'high',
        category: 'project',
        metadata: { project_id: '999', project: 'Dubai Mall' }
      },

      // Task Workflows
      'task_completed': {
        title: 'Task Completed',
        message: 'SE completed task: Foundation Work',
        type: 'success',
        priority: 'medium',
        category: 'task',
        metadata: { task_id: '777', task: 'Foundation Work' }
      },
      'issue_reported': {
        title: 'Issue Reported on Site',
        message: 'SE reported: Material shortage at Dubai Mall',
        type: 'alert',
        priority: 'urgent',
        category: 'project',
        metadata: { issue_id: '888', project: 'Dubai Mall' }
      },

      // Day Extension
      'extension_request': {
        title: 'Day Extension Request',
        message: 'PM requested 5 days extension for Dubai Mall',
        type: 'approval',
        priority: 'high',
        category: 'project',
        metadata: { extension_id: '222', days: 5, project: 'Dubai Mall' }
      },
      'extension_approved': {
        title: 'Day Extension Approved',
        message: 'Your 5 days extension request approved',
        type: 'success',
        priority: 'medium',
        category: 'project',
        metadata: { extension_id: '222' }
      }
    };

    const testNotification = testCases[type];
    if (!testNotification) {
      console.error('Unknown test type. Available types:', Object.keys(testCases));
      return;
    }

    const notification: NotificationData = {
      id: `test_${Date.now()}`,
      title: testNotification.title || 'Test Notification',
      message: testNotification.message || 'Test message',
      type: testNotification.type || 'info',
      priority: testNotification.priority || 'medium',
      category: testNotification.category || 'general',
      timestamp: new Date(),
      read: false,
      metadata: testNotification.metadata,
      actionRequired: testNotification.type === 'approval',
      actionLabel: testNotification.type === 'approval' ? 'Review' : undefined
    };

    store.addNotification(notification);
    console.log('✅ Test notification added:', notification);
    console.log('📍 Click it to test redirect!');
  };

  // Show all available test types
  (window as any).showTestTypes = () => {
    console.log(`
🧪 Available Test Notification Types:
=====================================

BOQ Workflows:
  testNotification('boq_pending')     - New BOQ for TD approval
  testNotification('boq_approved')    - TD approved BOQ
  testNotification('boq_rejected')    - TD rejected BOQ
  testNotification('client_approved') - Client approved BOQ
  testNotification('client_rejected') - Client rejected BOQ

Change Requests:
  testNotification('cr_pending')      - New CR for approval
  testNotification('cr_approved')     - CR approved

Vendor Management:
  testNotification('vendor_new')      - New vendor registration
  testNotification('vendor_approved') - Vendor approved
  testNotification('vendor_selected') - Vendor selected for CR

Purchase Orders:
  testNotification('po_pending')      - PO for approval
  testNotification('po_approved')     - PO approved

Material Management:
  testNotification('material_request')  - Extra material request
  testNotification('material_approved') - Material approved
  testNotification('low_stock')         - Low stock alert

Project Assignment:
  testNotification('pm_assigned')     - PM assigned to project
  testNotification('se_assigned')     - SE assigned to project

Tasks & Issues:
  testNotification('task_completed')  - Task completed by SE
  testNotification('issue_reported')  - Issue reported on site

Day Extension:
  testNotification('extension_request')  - Extension requested
  testNotification('extension_approved') - Extension approved

Usage: Type testNotification('type') in console
    `);
  };

  // Debug current notifications
  (window as any).debugNotifications = () => {
    const state = useNotificationStore.getState();
    console.log('📬 Current Notifications:', state.notifications);
    console.log('🔢 Unread Count:', state.unreadCount);
    console.log('🔔 Permission Granted:', state.isPermissionGranted);
    return state;
  };

  // Clear all notifications
  (window as any).clearNotifications = () => {
    const store = useNotificationStore.getState();
    store.clearAll();
    console.log('🗑️ All notifications cleared');
  };

  // Test redirect logic
  (window as any).testRedirect = (type: string) => {
    import('@/utils/notificationRedirects').then(({ getNotificationRedirectPath }) => {
      const testNotification: NotificationData = {
        id: 'test',
        title: 'Test',
        message: 'Test',
        type: 'info',
        priority: 'medium',
        category: 'general',
        timestamp: new Date(),
        read: false
      };

      // Add specific metadata based on type
      if (type.includes('boq')) {
        testNotification.title = 'BOQ Approved by Client';
        testNotification.metadata = { boq_id: '726' };
      } else if (type.includes('cr')) {
        testNotification.title = 'New Change Request';
        testNotification.metadata = { cr_id: '123' };
      }

      const userRole = localStorage.getItem('user_role') || 'estimator';
      const redirect = getNotificationRedirectPath(testNotification, userRole);

      console.log('🔄 Redirect config:', redirect);
      if (redirect) {
        const url = new URL(window.location.origin + redirect.path);
        if (redirect.queryParams) {
          Object.entries(redirect.queryParams).forEach(([key, value]) => {
            url.searchParams.append(key, value);
          });
        }
        console.log('📍 Would redirect to:', url.toString());
      }
    });
  };

  console.log(`
🔔 Notification System Debugger Loaded!
=======================================
Available commands:
  showTestTypes()         - Show all test notification types
  testNotification(type)  - Create a test notification
  debugNotifications()    - Show current notification state
  clearNotifications()    - Clear all notifications
  testRedirect(type)      - Test redirect logic without navigation

Type showTestTypes() to see all available test types.
  `);
}

export {};