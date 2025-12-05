/**
 * Admin Settings Page
 * System configurations, preferences, and administrative settings
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Settings as SettingsIcon,
  Save,
  RefreshCw,
  Bell,
  Shield,
  Database,
  Mail,
  Globe,
  Clock,
  DollarSign,
  FileText,
  Users,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  PenTool,
  Upload,
  Trash2
} from 'lucide-react';
import { showSuccess, showError, showWarning, showInfo } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { adminApi, SystemSettings } from '@/api/admin';

interface SettingsData {
  // General Settings
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress: string;
  timezone: string;
  currency: string;
  dateFormat: string;

  // Notification Settings
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
  dailyReports: boolean;
  weeklyReports: boolean;

  // Security Settings
  sessionTimeout: number;
  passwordExpiry: number;
  twoFactorAuth: boolean;
  ipWhitelist: string;

  // System Settings
  maintenanceMode: boolean;
  debugMode: boolean;
  autoBackup: boolean;
  backupFrequency: string;
  dataRetention: number;

  // Project Settings
  defaultProjectDuration: number;
  autoAssignProjects: boolean;
  requireApproval: boolean;
  budgetAlertThreshold: number;

  // Document/Signature Settings
  signatureImage: string | null;
  signatureEnabled: boolean;

  // LPO Signature Settings
  mdSignatureImage: string | null;
  mdName: string;
  tdSignatureImage: string | null;
  tdName: string;
  companyStampImage: string | null;
  companyTrn: string;
  companyFax: string;
  defaultPaymentTerms: string;
}

const AdminSettings: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'notifications' | 'security' | 'system' | 'projects' | 'documents'>('general');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isUploadingSignature, setIsUploadingSignature] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<SettingsData>({
    // General
    companyName: 'MeterSquare ERP',
    companyEmail: 'admin@metersquare.com',
    companyPhone: '+971 50 123 4567',
    companyAddress: 'Dubai, United Arab Emirates',
    timezone: 'Asia/Dubai',
    currency: 'AED',
    dateFormat: 'DD/MM/YYYY',

    // Notifications
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    dailyReports: true,
    weeklyReports: true,

    // Security
    sessionTimeout: 30,
    passwordExpiry: 90,
    twoFactorAuth: false,
    ipWhitelist: '',

    // System
    maintenanceMode: false,
    debugMode: false,
    autoBackup: true,
    backupFrequency: 'daily',
    dataRetention: 365,

    // Projects
    defaultProjectDuration: 90,
    autoAssignProjects: false,
    requireApproval: true,
    budgetAlertThreshold: 80,

    // Documents/Signature
    signatureImage: null,
    signatureEnabled: false,

    // LPO Signatures
    mdSignatureImage: null,
    mdName: 'Managing Director',
    tdSignatureImage: null,
    tdName: 'Technical Director',
    companyStampImage: null,
    companyTrn: '',
    companyFax: '',
    defaultPaymentTerms: '100% after delivery'
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const response = await adminApi.getSettings();
      setSettings(response.settings);
    } catch (error: any) {
      showError('Failed to fetch settings', {
        description: error.response?.data?.error || error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);
      const response = await adminApi.updateSettings(settings);
      showSuccess('Settings saved successfully');
      setSettings(response.settings); // Update with confirmed data from server
    } catch (error: any) {
      showError('Failed to save settings', {
        description: error.response?.data?.error || error.message
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle signature file upload
  const handleSignatureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showError('Please select an image file (PNG, JPG, etc.)');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showError('Signature image should be less than 2MB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = reader.result as string;
      setIsUploadingSignature(true);
      try {
        await adminApi.uploadSignature(base64Image);
        setSettings(prev => ({ ...prev, signatureImage: base64Image, signatureEnabled: true }));
        showSuccess('Signature uploaded successfully');
      } catch (error: any) {
        showError('Failed to upload signature', {
          description: error.response?.data?.error || error.message
        });
      } finally {
        setIsUploadingSignature(false);
      }
    };
    reader.onerror = () => {
      showError('Failed to read signature file');
    };
    reader.readAsDataURL(file);
  };

  // Handle signature delete
  const handleDeleteSignature = async () => {
    setIsUploadingSignature(true);
    try {
      await adminApi.deleteSignature();
      setSettings(prev => ({ ...prev, signatureImage: null, signatureEnabled: false }));
      if (signatureInputRef.current) {
        signatureInputRef.current.value = '';
      }
      showSuccess('Signature deleted successfully');
    } catch (error: any) {
      showError('Failed to delete signature', {
        description: error.response?.data?.error || error.message
      });
    } finally {
      setIsUploadingSignature(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'system', label: 'System', icon: Database },
    { id: 'projects', label: 'Projects', icon: FileText },
    { id: 'documents', label: 'Documents', icon: PenTool }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <SettingsIcon className="w-8 h-8 text-[#243d8a]" />
              System Settings
            </h1>
            <p className="text-gray-500 mt-1">Configure system preferences and administrative settings</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchSettings}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-3 bg-[#243d8a] text-white rounded-lg hover:bg-[#1e3270] transition-colors shadow-md disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 flex items-center justify-center">
            <ModernLoadingSpinners variant="pulse-wave" size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-6">
            {/* Sidebar Tabs */}
            <div className="col-span-3">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        activeTab === tab.id
                          ? 'bg-[#243d8a] text-white'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Settings Content */}
            <div className="col-span-9">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"
              >
                {/* General Settings */}
                {activeTab === 'general' && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <Globe className="w-6 h-6 text-[#243d8a]" />
                      General Settings
                    </h2>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Company Name</label>
                          <input
                            type="text"
                            value={settings.companyName}
                            onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Company Email</label>
                          <input
                            type="email"
                            value={settings.companyEmail}
                            onChange={(e) => setSettings({ ...settings, companyEmail: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Company Phone</label>
                          <input
                            type="tel"
                            value={settings.companyPhone}
                            onChange={(e) => setSettings({ ...settings, companyPhone: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                          <select
                            value={settings.timezone}
                            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="Asia/Dubai">Asia/Dubai (GST - UAE)</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Company Address</label>
                        <textarea
                          value={settings.companyAddress}
                          onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })}
                          rows={3}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
                          <select
                            value={settings.currency}
                            onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="AED">AED (د.إ - UAE Dirham)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Date Format</label>
                          <select
                            value={settings.dateFormat}
                            onChange={(e) => setSettings({ ...settings, dateFormat: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notification Settings */}
                {activeTab === 'notifications' && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <Bell className="w-6 h-6 text-[#243d8a]" />
                      Notification Settings
                    </h2>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">Email Notifications</p>
                          <p className="text-sm text-gray-500">Receive notifications via email</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.emailNotifications}
                            onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#243d8a]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">SMS Notifications</p>
                          <p className="text-sm text-gray-500">Receive notifications via SMS</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.smsNotifications}
                            onChange={(e) => setSettings({ ...settings, smsNotifications: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#243d8a]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">Push Notifications</p>
                          <p className="text-sm text-gray-500">Receive browser push notifications</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.pushNotifications}
                            onChange={(e) => setSettings({ ...settings, pushNotifications: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#243d8a]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">Daily Reports</p>
                          <p className="text-sm text-gray-500">Receive daily activity reports</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.dailyReports}
                            onChange={(e) => setSettings({ ...settings, dailyReports: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#243d8a]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">Weekly Reports</p>
                          <p className="text-sm text-gray-500">Receive weekly summary reports</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.weeklyReports}
                            onChange={(e) => setSettings({ ...settings, weeklyReports: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#243d8a]"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Security Settings */}
                {activeTab === 'security' && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <Shield className="w-6 h-6 text-[#243d8a]" />
                      Security Settings
                    </h2>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Session Timeout (minutes)
                          </label>
                          <input
                            type="number"
                            value={settings.sessionTimeout}
                            onChange={(e) => setSettings({ ...settings, sessionTimeout: parseInt(e.target.value) })}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Password Expiry (days)
                          </label>
                          <input
                            type="number"
                            value={settings.passwordExpiry}
                            onChange={(e) => setSettings({ ...settings, passwordExpiry: parseInt(e.target.value) })}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">Two-Factor Authentication</p>
                          <p className="text-sm text-gray-500">Require 2FA for all users</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.twoFactorAuth}
                            onChange={(e) => setSettings({ ...settings, twoFactorAuth: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#243d8a]"></div>
                        </label>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          IP Whitelist (comma-separated)
                        </label>
                        <textarea
                          value={settings.ipWhitelist}
                          onChange={(e) => setSettings({ ...settings, ipWhitelist: e.target.value })}
                          placeholder="192.168.1.1, 10.0.0.1"
                          rows={3}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Leave empty to allow all IPs</p>
                      </div>

                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                          <div>
                            <p className="font-medium text-blue-900">Security Recommendations</p>
                            <ul className="text-sm text-blue-700 mt-2 space-y-1">
                              <li>• Enable two-factor authentication for enhanced security</li>
                              <li>• Set session timeout to 30 minutes or less</li>
                              <li>• Use IP whitelist for admin access in production</li>
                              <li>• Enforce password expiry every 90 days</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* System Settings */}
                {activeTab === 'system' && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <Database className="w-6 h-6 text-[#243d8a]" />
                      System Settings
                    </h2>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">Maintenance Mode</p>
                          <p className="text-sm text-gray-500">Disable system access for maintenance</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.maintenanceMode}
                            onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">Debug Mode</p>
                          <p className="text-sm text-gray-500">Enable detailed error logging</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.debugMode}
                            onChange={(e) => setSettings({ ...settings, debugMode: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#243d8a]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">Automatic Backups</p>
                          <p className="text-sm text-gray-500">Enable scheduled database backups</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.autoBackup}
                            onChange={(e) => setSettings({ ...settings, autoBackup: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#243d8a]"></div>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Backup Frequency
                          </label>
                          <select
                            value={settings.backupFrequency}
                            onChange={(e) => setSettings({ ...settings, backupFrequency: e.target.value })}
                            disabled={!settings.autoBackup}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                          >
                            <option value="hourly">Hourly</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Data Retention (days)
                          </label>
                          <input
                            type="number"
                            value={settings.dataRetention}
                            onChange={(e) => setSettings({ ...settings, dataRetention: parseInt(e.target.value) })}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                          <div>
                            <p className="font-medium text-green-900">System Health</p>
                            <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                              <div>
                                <p className="text-green-700">Database</p>
                                <p className="font-medium text-green-900">Healthy</p>
                              </div>
                              <div>
                                <p className="text-green-700">API Server</p>
                                <p className="font-medium text-green-900">Online</p>
                              </div>
                              <div>
                                <p className="text-green-700">Last Backup</p>
                                <p className="font-medium text-green-900">2 hours ago</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Project Settings */}
                {activeTab === 'projects' && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <FileText className="w-6 h-6 text-[#243d8a]" />
                      Project Settings
                    </h2>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Default Project Duration (days)
                        </label>
                        <input
                          type="number"
                          value={settings.defaultProjectDuration}
                          onChange={(e) => setSettings({ ...settings, defaultProjectDuration: parseInt(e.target.value) })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Budget Alert Threshold (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={settings.budgetAlertThreshold}
                          onChange={(e) => setSettings({ ...settings, budgetAlertThreshold: parseInt(e.target.value) })}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Alert when budget reaches this percentage</p>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">Auto-Assign Projects</p>
                          <p className="text-sm text-gray-500">Automatically assign projects to available managers</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.autoAssignProjects}
                            onChange={(e) => setSettings({ ...settings, autoAssignProjects: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#243d8a]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">Require Approval</p>
                          <p className="text-sm text-gray-500">All projects require admin/TD approval</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.requireApproval}
                            onChange={(e) => setSettings({ ...settings, requireApproval: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#243d8a]"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Documents Settings - Signature Upload */}
                {activeTab === 'documents' && (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <PenTool className="w-6 h-6 text-[#243d8a]" />
                      Document Settings
                    </h2>

                    <div className="space-y-6">
                      {/* Company Signature Section */}
                      <div className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-2 bg-indigo-100 rounded-lg">
                            <PenTool className="w-5 h-5 text-indigo-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">Company Authorized Signature</h3>
                            <p className="text-sm text-gray-600">
                              Upload the company signature to include in client PDF quotations
                            </p>
                          </div>
                        </div>

                        {/* Hidden file input */}
                        <input
                          ref={signatureInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleSignatureUpload}
                          className="hidden"
                          disabled={isUploadingSignature}
                        />

                        {settings.signatureImage ? (
                          // Show uploaded signature preview
                          <div className="bg-white rounded-lg border border-gray-200 p-6">
                            <div className="flex items-start gap-6">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-700 mb-3">Current Signature:</p>
                                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex items-center justify-center">
                                  <img
                                    src={settings.signatureImage}
                                    alt="Company Signature"
                                    className="max-h-24 max-w-full object-contain"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <button
                                  onClick={() => signatureInputRef.current?.click()}
                                  disabled={isUploadingSignature}
                                  className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors disabled:opacity-50"
                                >
                                  <Upload className="w-4 h-4" />
                                  Change
                                </button>
                                <button
                                  onClick={handleDeleteSignature}
                                  disabled={isUploadingSignature}
                                  className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Delete
                                </button>
                              </div>
                            </div>
                            <div className="mt-4 flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              <span className="text-sm text-green-700">
                                Signature is active - Estimators can include it in client PDFs
                              </span>
                            </div>
                          </div>
                        ) : (
                          // Show upload button
                          <div className="bg-white rounded-lg border-2 border-dashed border-indigo-300 p-8">
                            <div className="text-center">
                              <div className="mx-auto w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                                <Upload className="w-8 h-8 text-indigo-600" />
                              </div>
                              <h4 className="text-lg font-medium text-gray-900 mb-2">Upload Company Signature</h4>
                              <p className="text-sm text-gray-500 mb-4">
                                PNG, JPG or GIF - Max 2MB - Transparent background recommended
                              </p>
                              <button
                                onClick={() => signatureInputRef.current?.click()}
                                disabled={isUploadingSignature}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                              >
                                {isUploadingSignature ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    Uploading...
                                  </>
                                ) : (
                                  <>
                                    <Upload className="w-4 h-4" />
                                    Select Signature Image
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Info Box */}
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                          <div>
                            <p className="font-medium text-blue-900">How Signatures Work</p>
                            <ul className="text-sm text-blue-700 mt-2 space-y-1">
                              <li>• Upload the company authorized signature here</li>
                              <li>• When estimators send BOQ to clients, they can choose to include the signature</li>
                              <li>• The signature will appear on both the cover page and quotation signature section</li>
                              <li>• If no signature is uploaded, estimators won't see the include signature option</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* LPO Signatures Note */}
                      <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-start gap-3">
                          <FileText className="w-5 h-5 text-green-600 mt-0.5" />
                          <div>
                            <p className="font-medium text-green-900">LPO (Purchase Order) Signatures</p>
                            <p className="text-sm text-green-700 mt-1">
                              For LPO signatures (MD, TD, Company Seal), please use the dedicated{' '}
                              <a href="/admin/signature-upload" className="underline font-medium hover:text-green-800">
                                Signature Upload
                              </a>{' '}
                              page from the sidebar menu.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ✅ PERFORMANCE: Wrap with React.memo to prevent unnecessary re-renders (681 lines)
export default React.memo(AdminSettings);
