/**
 * Admin CC & Email Settings Page
 * Manage default CC recipients for vendor purchase order emails
 */

import React, { useState, useEffect } from 'react';
import {
  Mail,
  RefreshCw,
  CheckCircle,
  X,
  Plus,
  AlertCircle,
  Users
} from 'lucide-react';
import { showSuccess, showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { emailCcService, CcRecipient } from '@/services/emailCcService';

const AdminCcEmailSettings: React.FC = () => {
  const [ccDefaults, setCcDefaults] = useState<CcRecipient[]>([]);
  const [loadingCcDefaults, setLoadingCcDefaults] = useState(true);
  const [newCcEmail, setNewCcEmail] = useState('');
  const [newCcName, setNewCcName] = useState('');
  const [addingCc, setAddingCc] = useState(false);

  useEffect(() => {
    fetchCcDefaults();
  }, []);

  const fetchCcDefaults = async () => {
    try {
      setLoadingCcDefaults(true);
      const defaults = await emailCcService.getCcDefaults();
      setCcDefaults(defaults);
    } catch {
      showError('Failed to load CC defaults');
    } finally {
      setLoadingCcDefaults(false);
    }
  };

  const handleAddCcDefault = async () => {
    const email = newCcEmail.trim().toLowerCase();
    const name = newCcName.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('Please enter a valid email address');
      return;
    }
    try {
      setAddingCc(true);
      const added = await emailCcService.addCcDefault(email, name);
      if (added) {
        setCcDefaults(prev => [...prev, added]);
        setNewCcEmail('');
        setNewCcName('');
        showSuccess('CC default added');
      }
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to add CC default');
    } finally {
      setAddingCc(false);
    }
  };

  const handleRemoveCcDefault = async (id: number) => {
    try {
      await emailCcService.removeCcDefault(id);
      setCcDefaults(prev => prev.filter(d => d.id !== id));
      showSuccess('CC default removed');
    } catch {
      showError('Failed to remove CC default');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 shadow-sm border-b border-purple-100">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Mail className="w-6 h-6 text-purple-600" />
              </div>
              CC & Email Settings
            </h1>
            <p className="text-gray-500 mt-1 ml-[52px]">Manage default CC recipients for vendor purchase order emails</p>
          </div>
          <button
            onClick={fetchCcDefaults}
            disabled={loadingCcDefaults}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loadingCcDefaults ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Info Banner */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-blue-900">How CC Defaults Work</p>
              <ul className="text-sm text-blue-700 mt-1.5 space-y-0.5">
                <li>These email addresses are automatically CC'd on every vendor purchase order email sent by buyers.</li>
                <li>Buyers can deselect specific defaults when sending, and also add their own custom CC recipients.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* CC Defaults Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Card Header */}
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-purple-600" />
                <h2 className="text-lg font-semibold text-gray-900">Default CC Recipients</h2>
              </div>
              <span className="text-sm text-gray-500">
                {ccDefaults.length} recipient{ccDefaults.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Card Body */}
          <div className="p-6">
            {loadingCcDefaults ? (
              <div className="flex justify-center py-8">
                <ModernLoadingSpinners size="md" />
              </div>
            ) : (
              <>
                {/* Existing CC defaults list */}
                <div className="space-y-2 mb-6">
                  {ccDefaults.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="mx-auto w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                        <Mail className="w-7 h-7 text-gray-400" />
                      </div>
                      <p className="text-gray-500 font-medium">No default CC recipients configured</p>
                      <p className="text-sm text-gray-400 mt-1">Add recipients below to CC them on all vendor emails</p>
                    </div>
                  ) : (
                    ccDefaults.map((cc) => (
                      <div key={cc.id} className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                        <CheckCircle className="w-4.5 h-4.5 text-green-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-900">{cc.name || cc.email.split('@')[0]}</span>
                          <span className="text-xs text-gray-500 ml-2">&lt;{cc.email}&gt;</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCcDefault(cc.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Add new CC default */}
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-3">Add New CC Recipient</p>
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                      <input
                        type="text"
                        value={newCcName}
                        onChange={(e) => setNewCcName(e.target.value)}
                        placeholder="e.g. John Doe"
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                      <input
                        type="email"
                        value={newCcEmail}
                        onChange={(e) => setNewCcEmail(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddCcDefault(); }}
                        placeholder="e.g. john@company.com"
                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCcDefault}
                      disabled={addingCc || !newCcEmail.trim()}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {addingCc ? (
                        <ModernLoadingSpinners size="xs" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(AdminCcEmailSettings);
