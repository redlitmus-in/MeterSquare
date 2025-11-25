/**
 * Desktop Notification Test Suite
 * Comprehensive testing for desktop notifications
 */

import { notificationService } from '@/services/notificationService';
import { useNotificationStore } from '@/store/notificationStore';

export const testDesktopNotifications = {
  /**
   * Step 1: Check browser support and permissions
   */
  checkSupport: () => {
    console.log('🔍 Checking Desktop Notification Support...\n');

    const support = {
      browserSupport: 'Notification' in window,
      serviceWorkerSupport: 'serviceWorker' in navigator,
      currentPermission: Notification.permission,
      serviceWorkerStatus: 'checking...'
    };

    // Check service worker status
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        support.serviceWorkerStatus = registrations.length > 0
          ? `Active (${registrations.length} registered)`
          : 'Not registered';

        console.table(support);

        if (!support.browserSupport) {
          console.error('❌ Browser does not support notifications!');
        } else if (support.currentPermission === 'denied') {
          console.error('❌ Notifications are blocked! Enable them in browser settings.');
        } else if (support.currentPermission === 'default') {
          console.warn('⚠️ Notification permission not granted. Run: testDesktopNotifications.requestPermission()');
        } else {
          console.log('✅ Desktop notifications are ready!');
        }

        if (registrations.length > 0) {
          console.log('\n📦 Service Workers:');
          registrations.forEach((reg, i) => {
            console.log(`  ${i + 1}. Scope: ${reg.scope}, Active: ${reg.active?.state || 'none'}`);
          });
        }
      });
    }

    return support;
  },

  /**
   * Step 2: Request notification permission
   */
  requestPermission: async () => {
    console.log('🔔 Requesting notification permission...\n');

    const permission = await notificationService.requestPermission();

    if (permission === 'granted') {
      console.log('✅ Permission granted! Desktop notifications enabled.');
    } else if (permission === 'denied') {
      console.error('❌ Permission denied. You need to enable it in browser settings:');
      console.log('   Chrome: Settings → Privacy → Site Settings → Notifications');
      console.log('   Firefox: Settings → Privacy → Notifications');
    } else {
      console.warn('⚠️ Permission dismissed. Try again later.');
    }

    return permission;
  },

  /**
   * Step 3: Test desktop notification with redirect
   */
  testNotification: async (type: 'boq' | 'cr' | 'vendor' | 'material' = 'boq') => {
    console.log(`\n🚀 Testing desktop notification (${type})...\n`);

    const store = useNotificationStore.getState();

    const testCases = {
      boq: {
        id: `desktop_test_${Date.now()}`,
        type: 'approval' as const,
        title: '🔔 BOQ Approved by Client',
        message: 'Client ABC has approved BOQ #726 for Dubai Mall project',
        priority: 'high' as const,
        category: 'approval' as const,
        timestamp: new Date(),
        read: false,
        metadata: {
          boq_id: '726',
          project: 'Dubai Mall',
          client: 'ABC Client',
          link: '/boq/726'
        }
      },
      cr: {
        id: `desktop_test_${Date.now()}`,
        type: 'approval' as const,
        title: '📋 New Change Request',
        message: 'Change request CR-123 requires your approval',
        priority: 'high' as const,
        category: 'change_request' as const,
        timestamp: new Date(),
        read: false,
        metadata: {
          cr_id: '123',
          project: 'Dubai Mall',
          link: '/change-request/123'
        }
      },
      vendor: {
        id: `desktop_test_${Date.now()}`,
        type: 'info' as const,
        title: '🏭 Vendor Selected',
        message: 'Vendor ABC Trading selected for your change request',
        priority: 'medium' as const,
        category: 'vendor' as const,
        timestamp: new Date(),
        read: false,
        metadata: {
          vendor_id: '456',
          vendor: 'ABC Trading',
          cr_id: '123'
        }
      },
      material: {
        id: `desktop_test_${Date.now()}`,
        type: 'alert' as const,
        title: '⚠️ Low Stock Alert',
        message: 'Steel Rods inventory below minimum threshold',
        priority: 'urgent' as const,
        category: 'material' as const,
        timestamp: new Date(),
        read: false,
        metadata: {
          material_id: '789',
          material: 'Steel Rods',
          current_stock: 50,
          min_stock: 100
        }
      }
    };

    const notification = testCases[type];

    // Add to store (this triggers desktop notification)
    store.addNotification(notification);

    // Also trigger desktop notification directly
    if (Notification.permission === 'granted') {
      await notificationService.sendBrowserNotification(notification);

      console.log('✅ Desktop notification sent!');
      console.log('📍 Click the desktop notification to test redirect');
      console.log('\nExpected redirect based on your role:');

      const userRole = localStorage.getItem('user_role') || 'estimator';

      switch(type) {
        case 'boq':
          if (userRole.includes('technical')) {
            console.log('   → /technical-director/projects?tab=client_response&boq_id=726');
          } else {
            console.log('   → /estimator/projects?tab=approved&boq_id=726');
          }
          break;
        case 'cr':
          console.log(`   → /${userRole}/change-requests?tab=pending&cr_id=123`);
          break;
        case 'vendor':
          console.log(`   → /${userRole}/vendors?vendor_id=456`);
          break;
        case 'material':
          console.log(`   → /${userRole}/materials?tab=low_stock&material_id=789`);
          break;
      }
    } else {
      console.error('❌ Notifications not permitted. Run: testDesktopNotifications.requestPermission()');
    }
  },

  /**
   * Step 4: Test multiple notifications
   */
  testMultiple: async () => {
    console.log('\n🎯 Testing multiple desktop notifications...\n');

    const types: Array<'boq' | 'cr' | 'vendor' | 'material'> = ['boq', 'cr', 'vendor', 'material'];

    for (let i = 0; i < types.length; i++) {
      await testDesktopNotifications.testNotification(types[i]);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    }

    console.log('\n✅ All test notifications sent!');
  },

  /**
   * Step 5: Check service worker
   */
  checkServiceWorker: async () => {
    console.log('\n🔧 Checking Service Worker...\n');

    if (!('serviceWorker' in navigator)) {
      console.error('❌ Service Workers not supported!');
      return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();

    if (registrations.length === 0) {
      console.warn('⚠️ No service worker registered. Registering now...');

      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('✅ Service Worker registered:', registration);

        // Wait for activation
        if (registration.active) {
          console.log('✅ Service Worker is active');
        } else {
          console.log('⏳ Service Worker is installing...');

          registration.addEventListener('statechange', () => {
            if (registration.active) {
              console.log('✅ Service Worker activated!');
            }
          });
        }
      } catch (error) {
        console.error('❌ Failed to register service worker:', error);
      }
    } else {
      console.log('✅ Service Worker Details:');
      registrations.forEach(reg => {
        console.log(`   Scope: ${reg.scope}`);
        console.log(`   State: ${reg.active?.state || 'not active'}`);
        console.log(`   Script: ${reg.active?.scriptURL || 'none'}`);
      });
    }
  },

  /**
   * Step 6: Test click simulation (for debugging)
   */
  simulateClick: () => {
    console.log('\n🖱️ Simulating notification click...\n');

    // Get last notification from store
    const store = useNotificationStore.getState();
    const lastNotification = store.notifications[0];

    if (!lastNotification) {
      console.error('❌ No notifications found. Create one first with testNotification()');
      return;
    }

    console.log('📦 Notification:', lastNotification);
    console.log('🔄 Triggering redirect logic...');

    // Import and test redirect
    import('@/utils/notificationRedirects').then(({ getNotificationRedirectPath, buildNotificationUrl }) => {
      const userRole = localStorage.getItem('user_role') || 'estimator';
      const redirectConfig = getNotificationRedirectPath(lastNotification, userRole);

      if (redirectConfig) {
        const url = buildNotificationUrl(redirectConfig);
        console.log('✅ Would redirect to:', url);
        console.log('\nTo actually navigate, run:');
        console.log(`   window.location.href = '${url}'`);
      } else {
        console.warn('⚠️ No redirect config found for this notification');
      }
    });
  },

  /**
   * Complete test suite
   */
  runFullTest: async () => {
    console.clear();
    console.log('🧪 DESKTOP NOTIFICATION COMPLETE TEST SUITE\n');
    console.log('=' .repeat(50));

    // Step 1: Check support
    console.log('\n📋 Step 1: Checking Support...');
    testDesktopNotifications.checkSupport();

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Check permission
    console.log('\n📋 Step 2: Checking Permission...');
    if (Notification.permission !== 'granted') {
      await testDesktopNotifications.requestPermission();
    } else {
      console.log('✅ Permission already granted');
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 3: Check service worker
    console.log('\n📋 Step 3: Service Worker Status...');
    await testDesktopNotifications.checkServiceWorker();

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 4: Send test notification
    console.log('\n📋 Step 4: Sending Test Notification...');
    await testDesktopNotifications.testNotification('boq');

    console.log('\n' + '=' .repeat(50));
    console.log('✅ TEST COMPLETE!');
    console.log('\n📍 Click the desktop notification to test redirect');
    console.log('💡 Run individual tests:');
    console.log('   testDesktopNotifications.testNotification("boq")');
    console.log('   testDesktopNotifications.testNotification("cr")');
    console.log('   testDesktopNotifications.testMultiple()');
  }
};

// Make available globally in dev
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).testDesktopNotifications = testDesktopNotifications;

  console.log(`
🖥️ Desktop Notification Tester Loaded!
======================================

Quick Test:
  testDesktopNotifications.runFullTest()  - Run complete test suite

Individual Tests:
  testDesktopNotifications.checkSupport()      - Check browser support
  testDesktopNotifications.requestPermission() - Request permission
  testDesktopNotifications.checkServiceWorker() - Check SW status
  testDesktopNotifications.testNotification()   - Send test notification
  testDesktopNotifications.testMultiple()       - Send multiple notifications
  testDesktopNotifications.simulateClick()      - Test redirect logic

Test Different Types:
  testDesktopNotifications.testNotification('boq')      - BOQ notification
  testDesktopNotifications.testNotification('cr')       - Change Request
  testDesktopNotifications.testNotification('vendor')   - Vendor notification
  testDesktopNotifications.testNotification('material') - Material alert
  `);
}

