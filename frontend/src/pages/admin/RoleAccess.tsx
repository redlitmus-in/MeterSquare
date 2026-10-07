/**
 * Role Access Page (Admin / Technical Director)
 * Grant a user temporary access to another role, with an end date.
 * Granting uses the step-by-step RoleAccessWizard.
 * Access type:
 *  - Fresh role: the user starts empty in that role; projects are assigned to them normally.
 *  - Same as existing user: the user gets the same access as an existing holder of the role.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, Plus, RefreshCw, AlertTriangle } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { roleAccessApi, RoleGrant, RoleGrantCounts } from '@/api/roleAccess';
import RoleAccessWizard, { roleLabel, formatDate, initials } from './RoleAccessWizard';

type TabKey = 'active' | 'scheduled' | 'expired' | 'revoked' | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'expired', label: 'Expired' },
  { key: 'revoked', label: 'Revoked' },
  { key: 'all', label: 'All' },
];


const statusBadge = (grant: RoleGrant) => {
  switch (grant.status) {
    case 'active': {
      const left = grant.days_left ?? 0;
      if (left === 0) return { text: 'Ends today', cls: 'bg-amber-100 text-amber-900' };
      if (left <= 3) return { text: `Ends in ${left} day${left === 1 ? '' : 's'}`, cls: 'bg-amber-100 text-amber-900' };
      return { text: `Active · ${left} days left`, cls: 'bg-green-100 text-green-900' };
    }
    case 'scheduled':
      return { text: `Starts ${formatDate(grant.start_date)}`, cls: 'bg-blue-100 text-blue-900' };
    case 'expired':
      return { text: 'Expired', cls: 'bg-gray-200 text-gray-700' };
    case 'revoked':
      return { text: 'Revoked', cls: 'bg-red-100 text-red-900' };
  }
};


const RoleAccess: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('active');
  const [grants, setGrants] = useState<RoleGrant[]>([]);
  const [counts, setCounts] = useState<RoleGrantCounts | null>(null);
  const [today, setToday] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<RoleGrant | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadGrants = useCallback(async () => {
    try {
      setLoading(true);
      const data = await roleAccessApi.getGrants('all');
      setGrants(data.grants);
      setCounts(data.counts);
      setToday(data.today);
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to load role access');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGrants();
  }, [loadGrants]);

  const visible = useMemo(
    () => (tab === 'all' ? grants : grants.filter((g) => g.status === tab)),
    [grants, tab]
  );

  const tabCount = (key: TabKey) => {
    if (!counts) return 0;
    return key === 'all' ? counts.all : counts[key];
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      setRevoking(true);
      await roleAccessApi.revokeGrant(revokeTarget.grant_id);
      showSuccess(`${revokeTarget.user_name} no longer has ${roleLabel(revokeTarget.role)} access`);
      setRevokeTarget(null);
      loadGrants();
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to revoke access');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#243d8a]/5 to-[#243d8a]/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <KeyRound className="w-8 h-8 text-[#243d8a]" />
              Role Access
            </h1>
            <p className="text-gray-600 mt-1">
              Give a user temporary access to another role. They log in with the same email and can switch roles
              anytime. Access ends automatically at 11:59 PM on the end date.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadGrants}
              aria-label="Refresh"
              className="p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-2 px-5 py-3 bg-[#243d8a] text-white rounded-lg hover:bg-[#1a2d66] transition-colors shadow-md font-semibold"
            >
              <Plus className="w-5 h-5" />
              Grant role access
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Active now', value: counts?.active ?? 0, cls: 'text-gray-900' },
            { label: 'Ending within 3 days', value: counts?.ending_soon ?? 0, cls: 'text-amber-700' },
            { label: 'Scheduled', value: counts?.scheduled ?? 0, cls: 'text-gray-900' },
            { label: 'Expired or revoked', value: (counts?.expired ?? 0) + (counts?.revoked ?? 0), cls: 'text-gray-900' },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="text-sm font-medium text-gray-500">{s.label}</div>
              <div className={`text-3xl font-bold mt-1 ${s.cls}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="flex flex-wrap gap-1 p-3 border-b border-gray-100">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  tab === t.key ? 'bg-[#243d8a] text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label} <span className="opacity-75">({tabCount(t.key)})</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-16 flex justify-center">
              <ModernLoadingSpinners size="md" />
            </div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center text-gray-500">No role access in this list.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Granted role</th>
                    <th className="px-4 py-3 font-semibold">Access type</th>
                    <th className="px-4 py-3 font-semibold">Period</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Granted by</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((g) => {
                    const badge = statusBadge(g);
                    const held = g.projects_still_assigned ?? 0;
                    return (
                      <tr key={g.grant_id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#243d8a]/10 text-[#243d8a] font-bold text-xs flex items-center justify-center shrink-0">
                              {initials(g.user_name)}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">{g.user_name}</div>
                              <div className="text-xs text-gray-500">Own role: {roleLabel(g.user_primary_role)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{roleLabel(g.role)}</td>
                        <td className="px-4 py-3">
                          {g.access_type === 'fresh' ? (
                            <span className="font-medium">Fresh role</span>
                          ) : (
                            <div>
                              <div className="font-medium">Same as existing user</div>
                              <div className="text-xs text-gray-500">{g.source_user_name}'s access</div>
                            </div>
                          )}
                          {held > 0 && (
                            <div
                              className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${
                                g.status === 'active' ? 'text-amber-800' : 'text-red-700'
                              }`}
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {g.status === 'active'
                                ? `To hand over before end: ${g.open_work_text}`
                                : `Still holds ${g.open_work_text}: reassign`}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                          {formatDate(g.start_date)} → {formatDate(g.end_date)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${badge.cls}`}>
                            {badge.text}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {g.granted_by_name}
                          {g.status === 'revoked' && g.revoked_by_name && (
                            <div className="text-xs text-gray-500">Revoked by {g.revoked_by_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(g.status === 'active' || g.status === 'scheduled') && (
                            <button
                              onClick={() => setRevokeTarget(g)}
                              className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:border-red-600 hover:text-red-700"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {drawerOpen && (
          <RoleAccessWizard
            today={today}
            onClose={() => {
              setDrawerOpen(false);
              loadGrants();
            }}
            onGranted={(grant) => {
              setDrawerOpen(false);
              setTab(grant.status === 'scheduled' ? 'scheduled' : 'active');
              loadGrants();
            }}
          />
        )}
      </AnimatePresence>

      {/* Revoke confirmation */}
      <AnimatePresence>
        {revokeTarget && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-label="Revoke role access"
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
            >
              <h2 className="text-lg font-bold text-gray-900">Revoke role access?</h2>
              <p className="text-gray-600 text-sm">
                {revokeTarget.user_name} will lose {roleLabel(revokeTarget.role)} access immediately. If they are using
                it right now, they are moved back to {roleLabel(revokeTarget.user_primary_role)} on their next action.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setRevokeTarget(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRevoke}
                  disabled={revoking}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
                >
                  {revoking ? 'Revoking...' : 'Revoke access'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RoleAccess;
