/**
 * Role Access Page (Admin / Technical Director)
 * Grant a user temporary access to another role, with an end date.
 * Granting uses the step-by-step RoleAccessWizard.
 * Row actions:
 *  - Active:    Extend (end date) · Edit (role / access type: ends this access and starts the new one today) · Pause · Revoke
 *  - Scheduled: Edit · Pause · Revoke
 *  - Paused:    Resume · Edit · Revoke
 *  - Expired / Revoked: Renew (prefilled wizard; creates a new grant so the old one stays in history)
 * Access type:
 *  - Fresh role: the user starts empty in that role; projects are assigned to them normally.
 *  - Same as existing user: the user gets the same access as an existing holder of the role.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, Plus, RefreshCw, AlertTriangle, CalendarPlus, Pencil, RotateCcw, Pause, Play } from 'lucide-react';
import { showSuccess, showError } from '@/utils/toastHelper';
import ModernLoadingSpinners from '@/components/ui/ModernLoadingSpinners';
import { roleAccessApi, RoleGrant, RoleGrantCounts } from '@/api/roleAccess';
import RoleAccessWizard, { roleLabel, formatDate, initials, addDays, WizardMode } from './RoleAccessWizard';

type TabKey = 'active' | 'scheduled' | 'paused' | 'expired' | 'revoked' | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'paused', label: 'Paused' },
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
    case 'paused':
      return { text: 'Paused', cls: 'bg-orange-100 text-orange-900' };
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
  const [wizard, setWizard] = useState<{ mode: WizardMode; grant: RoleGrant | null } | null>(null);
  const [extendTarget, setExtendTarget] = useState<RoleGrant | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RoleGrant | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [pauseTarget, setPauseTarget] = useState<RoleGrant | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

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

  const confirmPause = async () => {
    if (!pauseTarget) return;
    try {
      setBusyId(pauseTarget.grant_id);
      const result = await roleAccessApi.pauseGrant(pauseTarget.grant_id);
      showSuccess(result.message);
      setPauseTarget(null);
      setTab('paused');
      loadGrants();
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to pause access');
    } finally {
      setBusyId(null);
    }
  };

  const resume = async (grant: RoleGrant) => {
    try {
      setBusyId(grant.grant_id);
      const result = await roleAccessApi.resumeGrant(grant.grant_id);
      showSuccess(result.message);
      setTab(result.grant.status === 'scheduled' ? 'scheduled' : 'active');
      loadGrants();
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to resume access');
    } finally {
      setBusyId(null);
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
              onClick={() => setWizard({ mode: 'create', grant: null })}
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
                            <div className="text-xs text-gray-500">
                              {g.notes?.startsWith('Replaced') ? g.notes : `Revoked by ${g.revoked_by_name}`}
                            </div>
                          )}
                          {g.status === 'paused' && g.paused_by_name && (
                            <div className="text-xs text-gray-500">Paused by {g.paused_by_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {g.status === 'active' && (
                              <button
                                onClick={() => setExtendTarget(g)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#243d8a]/30 text-sm font-semibold text-[#243d8a] hover:bg-[#243d8a]/5"
                              >
                                <CalendarPlus className="w-4 h-4" /> Extend
                              </button>
                            )}
                            {g.status === 'paused' && (
                              <button
                                onClick={() => resume(g)}
                                disabled={busyId === g.grant_id}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#243d8a] text-sm font-semibold text-white hover:bg-[#1a2d66] disabled:opacity-60"
                              >
                                <Play className="w-4 h-4" /> Resume
                              </button>
                            )}
                            {(g.status === 'active' || g.status === 'scheduled' || g.status === 'paused') && (
                              <button
                                onClick={() => setWizard({ mode: 'edit', grant: g })}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#243d8a]/30 text-sm font-semibold text-[#243d8a] hover:bg-[#243d8a]/5"
                              >
                                <Pencil className="w-4 h-4" /> Edit
                              </button>
                            )}
                            {(g.status === 'active' || g.status === 'scheduled') && (
                              <button
                                onClick={() => setPauseTarget(g)}
                                aria-label={`Pause ${g.user_name}'s access`}
                                title="Pause"
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:border-orange-500 hover:text-orange-700"
                              >
                                <Pause className="w-4 h-4" /> Pause
                              </button>
                            )}
                            {(g.status === 'active' || g.status === 'scheduled' || g.status === 'paused') && (
                              <button
                                onClick={() => setRevokeTarget(g)}
                                className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:border-red-600 hover:text-red-700"
                              >
                                Revoke
                              </button>
                            )}
                            {(g.status === 'expired' || g.status === 'revoked') && (
                              <button
                                onClick={() => setWizard({ mode: 'renew', grant: g })}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#243d8a] text-sm font-semibold text-white hover:bg-[#1a2d66]"
                              >
                                <RotateCcw className="w-4 h-4" /> Renew
                              </button>
                            )}
                          </div>
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
        {wizard && (
          <RoleAccessWizard
            today={today}
            mode={wizard.mode}
            initial={wizard.grant}
            onClose={() => {
              setWizard(null);
              loadGrants();
            }}
            onGranted={(grant) => {
              setWizard(null);
              setTab(grant.status === 'scheduled' ? 'scheduled' : 'active');
              loadGrants();
            }}
          />
        )}
      </AnimatePresence>

      {/* Extend (change end date of active access) */}
      <AnimatePresence>
        {extendTarget && (
          <ExtendDialog
            grant={extendTarget}
            today={today}
            onClose={() => setExtendTarget(null)}
            onSaved={() => {
              setExtendTarget(null);
              loadGrants();
            }}
          />
        )}
      </AnimatePresence>

      {/* Pause confirmation */}
      <AnimatePresence>
        {pauseTarget && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-label="Pause role access"
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
            >
              <h2 className="text-lg font-bold text-gray-900">Pause role access?</h2>
              <p className="text-gray-600 text-sm">
                {pauseTarget.user_name} stops having {roleLabel(pauseTarget.role)} access right away. If they are using
                it now, they are moved back to {roleLabel(pauseTarget.user_primary_role)} on their next action. The dates
                stay as they are, and you can resume it at any time before {formatDate(pauseTarget.end_date)}.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setPauseTarget(null)}
                  className="px-4 py-2 rounded-lg border border-gray-300 font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPause}
                  disabled={busyId === pauseTarget.grant_id}
                  className="px-4 py-2 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-60"
                >
                  {busyId === pauseTarget.grant_id ? 'Pausing...' : 'Pause access'}
                </button>
              </div>
            </motion.div>
          </motion.div>
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

const EXTEND_PICKS = [
  { label: '+1 day', days: 1 },
  { label: '+1 week', days: 7 },
  { label: '+2 weeks', days: 14 },
  { label: '+1 month', days: 30 },
];
const MAX_GRANT_DAYS = 366;

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);

const ExtendDialog: React.FC<{ grant: RoleGrant; today: string; onClose: () => void; onSaved: () => void }> = ({
  grant,
  today,
  onClose,
  onSaved,
}) => {
  const [endDate, setEndDate] = useState(addDays(grant.end_date, 7));
  const [saving, setSaving] = useState(false);
  const minDate = grant.start_date > today ? grant.start_date : today;
  const tooLong = !!endDate && daysBetween(grant.start_date, endDate) > MAX_GRANT_DAYS;
  const invalid = !endDate || endDate < minDate || tooLong || endDate === grant.end_date;

  const save = async () => {
    if (invalid || saving) return;
    try {
      setSaving(true);
      const result = await roleAccessApi.updateGrant(grant.grant_id, { end_date: endDate });
      showSuccess(result.message || 'Access updated');
      onSaved();
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to update access');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog"
        aria-label="Extend role access"
        className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
      >
        <div>
          <h2 className="text-lg font-bold text-gray-900">Extend role access</h2>
          <p className="text-gray-600 text-sm mt-1">
            {grant.user_name} · {roleLabel(grant.role)}
            {grant.access_type === 'existing' && grant.source_user_name ? ` (${grant.source_user_name}'s access)` : ''}
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm">
          <span className="text-gray-500">Now: </span>
          <span className="font-mono text-xs">
            {formatDate(grant.start_date)} → {formatDate(grant.end_date)}
          </span>
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-bold text-gray-600">
          New end date
          <input
            type="date"
            value={endDate}
            min={minDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-3 text-sm font-normal text-gray-900"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">From the current end date:</span>
          {EXTEND_PICKS.map((q) => {
            const value = addDays(grant.end_date, q.days);
            return (
              <button
                key={q.label}
                onClick={() => setEndDate(value)}
                className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                  endDate === value
                    ? 'bg-[#243d8a] border-[#243d8a] text-white'
                    : 'border-gray-300 text-[#243d8a] hover:bg-[#243d8a]/5'
                }`}
              >
                {q.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">
          Access ends at 11:59 PM on the new date. An earlier date shortens it. {grant.user_name} is notified.
        </p>
        {tooLong && (
          <div className="text-xs font-bold text-red-700">Access cannot run longer than {MAX_GRANT_DAYS} days from its start.</div>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={invalid || saving}
            className="px-4 py-2 rounded-lg bg-[#243d8a] text-white font-semibold hover:bg-[#1a2d66] disabled:opacity-50"
          >
            {saving ? 'Saving...' : endDate && endDate < grant.end_date ? 'Shorten access' : 'Extend access'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default RoleAccess;
