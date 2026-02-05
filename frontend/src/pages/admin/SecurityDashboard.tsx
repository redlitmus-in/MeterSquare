/**
 * Security Dashboard - Admin Only
 * Shows security metrics, blocked IPs, audit logs, and suspicious activity
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Ban,
  AlertTriangle,
  Activity,
  Clock,
  Globe,
  User,
  RefreshCw,
  Unlock,
  Eye,
  Filter,
  XCircle,
  CheckCircle
} from 'lucide-react';
import { showSuccess, showError } from '@/utils/toastHelper';
import { securityApi, SecuritySummary, AuditLog } from '@/api/security';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';

const SecurityDashboard: React.FC = () => {
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [blockedIPs, setBlockedIPs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchSummary(),
        fetchAuditLogs(),
        fetchBlockedIPs()
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchAllData();
      showSuccess('Security data refreshed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await securityApi.getSummary();
      setSummary(response.data);
    } catch (error: any) {
      showError('Failed to fetch security summary', {
        description: error.response?.data?.error || error.message
      });
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await securityApi.getAuditLogs({
        event_type: eventTypeFilter || undefined,
        severity: severityFilter || undefined,
        limit: 50
      });
      setAuditLogs(response.data);
    } catch (error: any) {
      console.error('Failed to fetch audit logs:', error);
    }
  };

  const fetchBlockedIPs = async () => {
    try {
      const response = await securityApi.getBlockedIPs();
      setBlockedIPs(response.data);
    } catch (error: any) {
      console.error('Failed to fetch blocked IPs:', error);
    }
  };

  const handleUnblockIP = async (ip: string) => {
    try {
      await securityApi.unblockIP(ip);
      showSuccess(`IP ${ip} unblocked successfully`);
      fetchBlockedIPs();
      fetchSummary();
    } catch (error: any) {
      showError('Failed to unblock IP', {
        description: error.response?.data?.error || error.message
      });
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity?.toUpperCase()) {
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-200';
      case 'WARNING': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'INFO': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getEventTypeIcon = (eventType: string) => {
    switch (eventType) {
      case 'LOGIN_FAILED': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'LOGIN_SUCCESS': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'IP_BLOCKED': return <Ban className="w-4 h-4 text-red-600" />;
      case 'SUSPICIOUS_REQUEST': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'RATE_LIMIT_EXCEEDED': return <ShieldAlert className="w-4 h-4 text-orange-500" />;
      default: return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatEventDetails = (details: Record<string, any>, eventType: string) => {
    if (!details || Object.keys(details).length === 0) return null;

    const formatValue = (key: string, value: any): string => {
      if (value === true) return 'Yes';
      if (value === false) return 'No';
      if (value === null || value === undefined) return '-';
      return String(value);
    };

    const labelMap: Record<string, string> = {
      email: 'Email',
      attempt: 'Attempt',
      reason: 'Reason',
      block_count: 'Block #',
      duration_hours: 'Duration',
      is_permanent: 'Permanent',
      limit: 'Rate Limit',
      endpoint: 'Endpoint',
      ip: 'IP Address',
      unblocked_by: 'Unblocked By',
      pattern: 'Pattern'
    };

    return (
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(details).map(([key, value]) => {
          const label = labelMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          let displayValue = formatValue(key, value);

          // Format duration_hours specially
          if (key === 'duration_hours' && typeof value === 'number') {
            if (value >= 720) displayValue = '30 days';
            else if (value >= 168) displayValue = '7 days';
            else if (value >= 48) displayValue = '48 hours';
            else displayValue = `${value} hours`;
          }

          return (
            <span key={key} className="text-xs">
              <span className="text-gray-400">{label}:</span>{' '}
              <span className="text-gray-600 font-medium">{displayValue}</span>
            </span>
          );
        })}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <ModernLoadingSpinners size="lg" />
        <p className="text-gray-500">Loading security data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-600/10 to-orange-500/10 shadow-sm border-b border-red-100">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Shield className="w-8 h-8 text-red-600" />
              Security Dashboard
            </h1>
            <p className="text-gray-500 mt-1">Monitor security events and manage IP blocking</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-md disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Failed Logins */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Failed Logins (24h)</p>
                <p className="text-3xl font-bold text-red-600">{summary?.failed_logins_24h || 0}</p>
              </div>
              <div className="p-3 bg-red-100 rounded-lg">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </motion.div>

          {/* Blocked IPs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Blocked IPs</p>
                <p className="text-3xl font-bold text-orange-600">{summary?.blocked_ips_count || 0}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <Ban className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </motion.div>

          {/* Suspicious IPs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Suspicious IPs</p>
                <p className="text-3xl font-bold text-yellow-600">{summary?.suspicious_ips_count || 0}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </motion.div>

          {/* Total Events */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Events (24h)</p>
                <p className="text-3xl font-bold text-blue-600">{summary?.total_events_24h || 0}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Activity className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Blocked IPs Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-600" />
              Blocked IPs
            </h2>

            {blockedIPs.length === 0 ? (
              <div className="text-center py-8">
                <ShieldCheck className="w-12 h-12 text-green-500 mx-auto mb-2" />
                <p className="text-gray-500">No blocked IPs</p>
                <p className="text-sm text-gray-400">All clear!</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {blockedIPs.map((ip) => (
                  <div
                    key={ip}
                    className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100"
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-red-600" />
                      <span className="font-mono text-sm">{ip}</span>
                    </div>
                    <button
                      onClick={() => handleUnblockIP(ip)}
                      className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                      title="Unblock IP"
                    >
                      <Unlock className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit Logs Panel */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-600" />
                Recent Security Events
              </h2>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <select
                  value={eventTypeFilter}
                  onChange={(e) => {
                    setEventTypeFilter(e.target.value);
                    setTimeout(fetchAuditLogs, 0);
                  }}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Events</option>
                  <option value="LOGIN_FAILED">Login Failed</option>
                  <option value="LOGIN_SUCCESS">Login Success</option>
                  <option value="IP_BLOCKED">IP Blocked</option>
                  <option value="SUSPICIOUS_REQUEST">Suspicious</option>
                  <option value="RATE_LIMIT_EXCEEDED">Rate Limited</option>
                </select>

                <select
                  value={severityFilter}
                  onChange={(e) => {
                    setSeverityFilter(e.target.value);
                    setTimeout(fetchAuditLogs, 0);
                  }}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Severity</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="WARNING">Warning</option>
                  <option value="INFO">Info</option>
                </select>
              </div>
            </div>

            {auditLogs.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500">No security events</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {auditLogs.map((log, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 hover:bg-gray-100 transition-colors"
                  >
                    <div className="mt-0.5">
                      {getEventTypeIcon(log.event_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900">
                          {log.event_type.replace(/_/g, ' ')}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getSeverityColor(log.severity)}`}>
                          {log.severity}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimestamp(log.timestamp)}
                        </span>
                        {log.ip_address && (
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {log.ip_address}
                          </span>
                        )}
                        {log.path && (
                          <span className="font-mono truncate max-w-[150px]">
                            {log.path}
                          </span>
                        )}
                      </div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        formatEventDetails(log.details, log.event_type)
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Security Info */}
        <div className="mt-6 bg-blue-50 rounded-xl border border-blue-100 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-900">Security Protection Active</h3>
              <p className="text-sm text-blue-700 mt-1">
                IP addresses are automatically blocked after 10 failed login attempts.
                Blocks expire after 24 hours. Localhost (127.0.0.1) is whitelisted for development.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityDashboard;
