/**
 * Notification Debug Panel
 * Shows real-time diagnostic information about the notification system
 */

import React, { useState, useEffect } from 'react';
import { X, Activity, Bell, Wifi, WifiOff, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { io } from 'socket.io-client';

interface DebugLog {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  data?: any;
}

export function NotificationDebugPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [socketStatus, setSocketStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [supabaseStatus, setSupabaseStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [userInfo, setUserInfo] = useState<any>(null);
  const [notificationCount, setNotificationCount] = useState(0);

  // Add log entry
  const addLog = (type: 'info' | 'success' | 'warning' | 'error', message: string, data?: any) => {
    const log: DebugLog = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      data
    };
    setLogs(prev => [log, ...prev].slice(0, 100)); // Keep last 100 logs
  };

  // Override console methods to capture logs
  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      originalLog(...args);
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');

      // Only capture notification-related logs
      if (message.includes('Socket.IO') ||
          message.includes('notification') ||
          message.includes('Notification') ||
          message.includes('NOTIFICATION') ||
          message.includes('Supabase') ||
          message.includes('🔔') ||
          message.includes('📨') ||
          message.includes('✅') ||
          message.includes('❌')) {

        if (message.includes('connected') || message.includes('✅')) {
          addLog('success', message);
          if (message.includes('Socket.IO connected')) {
            setSocketStatus('connected');
          }
          if (message.includes('Supabase realtime subscribed')) {
            setSupabaseStatus('connected');
          }
        } else if (message.includes('error') || message.includes('❌') || message.includes('Error')) {
          addLog('error', message);
          if (message.includes('Socket.IO')) {
            setSocketStatus('disconnected');
          }
        } else if (message.includes('warning') || message.includes('⚠️')) {
          addLog('warning', message);
        } else {
          addLog('info', message);
        }

        // Track notification count
        if (message.includes('NOTIFICATION STORE: addNotification called')) {
          setNotificationCount(prev => prev + 1);
        }
      }
    };

    console.warn = (...args) => {
      originalWarn(...args);
      const message = args.join(' ');
      if (message.includes('notification') || message.includes('Socket') || message.includes('Supabase')) {
        addLog('warning', message);
      }
    };

    console.error = (...args) => {
      originalError(...args);
      const message = args.join(' ');
      if (message.includes('notification') || message.includes('Socket') || message.includes('Supabase')) {
        addLog('error', message);
        if (message.includes('Socket.IO')) {
          setSocketStatus('disconnected');
        }
      }
    };

    // Get user info
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setUserInfo(user);
        addLog('info', `User loaded: ${user.full_name || user.name} (ID: ${user.user_id || user.id})`);
      } catch (e) {
        addLog('error', 'Failed to parse user data');
      }
    }

    // Check if realtimeHub is available
    const checkInterval = setInterval(() => {
      if ((window as any).realtimeHub) {
        const status = (window as any).realtimeHub.getStatus();
        setSocketStatus(status.socketConnected ? 'connected' : 'disconnected');
        setSupabaseStatus(status.supabaseConnected ? 'connected' : 'disconnected');
      }
    }, 1000);

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      clearInterval(checkInterval);
    };
  }, []);

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-[9999] bg-blue-600 hover:bg-blue-700"
        size="sm"
      >
        <Activity className="w-4 h-4 mr-2" />
        Debug Panel
      </Button>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-green-500';
      case 'disconnected': return 'bg-red-500';
      case 'connecting': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      default: return <Activity className="w-4 h-4 text-blue-600" />;
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[600px]">
      <Card className="shadow-2xl border-2 border-blue-500">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              <CardTitle className="text-sm font-semibold">Notification System Debug</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-white/20 h-6 w-6 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {/* Status Row */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="flex flex-col items-center p-2 bg-gray-50 rounded">
              <div className="flex items-center gap-1 mb-1">
                {socketStatus === 'connected' ? (
                  <Wifi className="w-4 h-4 text-green-600" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-600" />
                )}
                <span className="text-xs font-medium">Socket.IO</span>
              </div>
              <Badge className={`${getStatusColor(socketStatus)} text-white text-xs`}>
                {socketStatus}
              </Badge>
            </div>

            <div className="flex flex-col items-center p-2 bg-gray-50 rounded">
              <div className="flex items-center gap-1 mb-1">
                {supabaseStatus === 'connected' ? (
                  <Wifi className="w-4 h-4 text-green-600" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-600" />
                )}
                <span className="text-xs font-medium">Supabase</span>
              </div>
              <Badge className={`${getStatusColor(supabaseStatus)} text-white text-xs`}>
                {supabaseStatus}
              </Badge>
            </div>

            <div className="flex flex-col items-center p-2 bg-gray-50 rounded">
              <div className="flex items-center gap-1 mb-1">
                <Bell className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-medium">Received</span>
              </div>
              <Badge className="bg-blue-600 text-white text-xs">
                {notificationCount}
              </Badge>
            </div>

            <div className="flex flex-col items-center p-2 bg-gray-50 rounded">
              <div className="flex items-center gap-1 mb-1">
                <Activity className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-medium">Logs</span>
              </div>
              <Badge className="bg-purple-600 text-white text-xs">
                {logs.length}
              </Badge>
            </div>
          </div>

          {/* User Info */}
          {userInfo && (
            <div className="mb-3 p-2 bg-blue-50 rounded text-xs">
              <div className="font-semibold text-blue-900">User Info:</div>
              <div className="text-blue-700">
                ID: {userInfo.user_id || userInfo.id} | Role: {userInfo.role} | {userInfo.full_name || userInfo.name}
              </div>
            </div>
          )}

          {/* Logs */}
          <div className="h-[400px] rounded border bg-white overflow-y-auto">
            <div className="p-2 space-y-2">
              {logs.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-8">
                  Waiting for notification activity...
                  <br />
                  <span className="text-xs">Try sending a BOQ to TD or any notification action</span>
                </div>
              ) : (
                logs.map((log, index) => (
                  <div
                    key={index}
                    className={`p-2 rounded text-xs border-l-4 ${
                      log.type === 'error' ? 'bg-red-50 border-red-500' :
                      log.type === 'warning' ? 'bg-yellow-50 border-yellow-500' :
                      log.type === 'success' ? 'bg-green-50 border-green-500' :
                      'bg-blue-50 border-blue-500'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 font-mono">{log.timestamp}</span>
                      {getLogIcon(log.type)}
                      <div className="flex-1">
                        <div className="font-medium whitespace-pre-wrap break-words">{log.message}</div>
                        {log.data && (
                          <pre className="mt-1 text-xs bg-white p-1 rounded overflow-x-auto">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              onClick={() => setLogs([])}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              Clear
            </Button>
            <Button
              onClick={() => {
                // DIRECT Socket.IO Test - bypasses all abstraction
                const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://127.0.0.1:5000';
                const token = localStorage.getItem('access_token');

                addLog('info', '========================================');
                addLog('info', 'DIRECT SOCKET.IO CONNECTION TEST');
                addLog('info', '========================================');
                addLog('info', `Socket URL: ${socketUrl}`);
                addLog('info', `Token exists: ${!!token}`);
                addLog('info', `Token length: ${token?.length || 0}`);

                if (!token) {
                  addLog('error', 'NO TOKEN FOUND! User not logged in?');
                  return;
                }

                addLog('info', 'Creating direct Socket.IO connection...');

                const testSocket = io(socketUrl, {
                  query: { token },
                  transports: ['websocket', 'polling'],
                  reconnection: false,
                  timeout: 10000
                });

                testSocket.on('connect', () => {
                  addLog('success', `CONNECTED! Socket ID: ${testSocket.id}`);
                  setSocketStatus('connected');

                  // Listen for notifications
                  testSocket.on('notification', (data: any) => {
                    addLog('success', 'NOTIFICATION RECEIVED!');
                    addLog('info', JSON.stringify(data, null, 2));
                    setNotificationCount(prev => prev + 1);
                  });
                });

                testSocket.on('connect_error', (err: any) => {
                  addLog('error', `CONNECTION ERROR: ${err.message}`);
                  addLog('error', `Error type: ${err.type || 'unknown'}`);
                  setSocketStatus('disconnected');
                });

                testSocket.on('disconnect', (reason: string) => {
                  addLog('warning', `Disconnected: ${reason}`);
                  setSocketStatus('disconnected');
                });

                testSocket.on('error', (err: any) => {
                  addLog('error', `Socket error: ${err}`);
                });

                // Store on window for later use
                (window as any).testSocket = testSocket;
                addLog('info', 'Test socket stored as window.testSocket');
              }}
              size="sm"
              className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
            >
              Direct Test
            </Button>
            <Button
              onClick={() => {
                console.log('🔄 Manual reconnect triggered from debug panel');
                if ((window as any).realtimeHub) {
                  (window as any).realtimeHub.reconnect();
                } else {
                  console.error('❌ realtimeHub not found on window!');
                }
              }}
              size="sm"
              className="text-xs bg-orange-600 hover:bg-orange-700"
            >
              Reconnect
            </Button>
            <Button
              onClick={() => {
                if ((window as any).debugNotificationSystem) {
                  (window as any).debugNotificationSystem();
                }
              }}
              size="sm"
              variant="secondary"
              className="text-xs"
            >
              Status
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
