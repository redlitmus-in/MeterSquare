/**
 * Grant Role Access - step-by-step wizard (matches the approved walkthrough).
 * Steps: User → Role → Access type → [Choose user, for "Same as existing user"] → Period → Review → Done
 * Modes:
 *  - create: a new grant
 *  - edit:   change a scheduled grant (same user; opens on Period, earlier steps can be revisited)
 *  - renew:  grant ended or revoked access again, prefilled from the old grant (creates a new grant)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Search,
  UserPlus,
  Copy,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Check,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { showError } from '@/utils/toastHelper';
import { getRoleDisplayName } from '@/utils/roleRouting';
import {
  roleAccessApi,
  RoleGrant,
  GrantableUser,
  RoleOption,
  RoleHolder,
  RoleAccessType,
} from '@/api/roleAccess';

type StepKey = 'user' | 'role' | 'type' | 'source' | 'period' | 'review';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const roleLabel = (role?: string | null) => {
  if (!role) return '-';
  const label = getRoleDisplayName(role);
  return label === 'User' ? role : label;
};

export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

export const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

export const initials = (name?: string | null) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const QUICK_PICKS = [
  { label: '1 day', days: 0 },
  { label: '1 week', days: 6 },
  { label: '2 weeks', days: 13 },
  { label: '1 month', days: 29 },
];

const STEP_META: Record<StepKey, { short: string; title: string; body: string }> = {
  user: {
    short: 'User',
    title: 'Select the user',
    body: 'Search and pick the person who needs extra access. Their own role never changes.',
  },
  role: {
    short: 'Role',
    title: 'Select the role to give',
    body: 'Choose the extra role. Their own role can be picked only to share another user\'s access in that role. One person can hold several granted roles.',
  },
  type: {
    short: 'Access type',
    title: 'Choose Fresh or Same as existing user',
    body: 'Fresh role starts empty: nothing is copied from anyone and projects are assigned to them later. Same as existing user gives them exactly what another holder of the role sees.',
  },
  source: {
    short: 'Choose user',
    title: 'Choose whose access to share',
    body: 'They will see and work on the same projects, BOQs, change requests and approvals as the person you pick. Their actions are recorded under that person\'s name.',
  },
  period: {
    short: 'Period',
    title: 'Set the access period',
    body: 'Pick a start and end date, or use a quick pick. Access ends automatically at 11:59 PM on the end date. A future start date shows as Scheduled until then.',
  },
  review: {
    short: 'Review',
    title: 'Review and grant',
    body: 'Check the details. After granting, they are notified and can log in with the same email or switch roles from their account menu.',
  },
};

export type WizardMode = 'create' | 'edit' | 'renew';

interface Props {
  today: string;
  onClose: () => void;
  onGranted: (grant: RoleGrant) => void;
  mode?: WizardMode;
  initial?: RoleGrant | null;
}

const TITLES: Record<WizardMode, string> = {
  create: 'Grant role access',
  edit: 'Edit role access',
  renew: 'Renew role access',
};

const RoleAccessWizard: React.FC<Props> = ({ today, onClose, onGranted, mode = 'create', initial = null }) => {
  const prefill = mode !== 'create' ? initial : null;
  const editingActive = mode === 'edit' && prefill?.status === 'active';
  // Data
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<GrantableUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [holders, setHolders] = useState<RoleHolder[]>([]);
  const [holdersLoading, setHoldersLoading] = useState(false);

  // Selections
  const [user, setUser] = useState<GrantableUser | null>(() =>
    prefill
      ? {
          user_id: prefill.user_id,
          full_name: prefill.user_name || '',
          email: prefill.user_email || '',
          role_id: prefill.user_primary_role_id ?? 0,
          role: prefill.user_primary_role,
        }
      : null
  );
  const [role, setRole] = useState<RoleOption | null>(() =>
    prefill ? { role_id: prefill.role_id, role: prefill.role || '' } : null
  );
  const [accessType, setAccessType] = useState<RoleAccessType>(prefill ? prefill.access_type : 'fresh');
  const [source, setSource] = useState<RoleHolder | null>(null);
  const [startDate, setStartDate] = useState(mode === 'edit' && prefill ? prefill.start_date : today);
  const [endDate, setEndDate] = useState(mode === 'edit' && prefill ? prefill.end_date : '');
  // The shared user is picked once the holders list for the prefilled role has loaded
  const pendingSourceId = useRef<number | null>(prefill?.source_user_id ?? null);

  // Flow
  // Prefilled flows open on the Period step; Back still reaches the earlier steps
  const [stepIndex, setStepIndex] = useState(() =>
    prefill ? (prefill.access_type === 'existing' ? 4 : 3) - (mode === 'edit' ? 1 : 0) : 0
  );
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);
  const [granted, setGranted] = useState<RoleGrant | null>(null);

  const steps: StepKey[] = useMemo(() => {
    const all: StepKey[] =
      accessType === 'existing' ? ['user', 'role', 'type', 'source', 'period', 'review'] : ['user', 'role', 'type', 'period', 'review'];
    // An edit keeps the same user
    return mode === 'edit' ? all.filter((s) => s !== 'user') : all;
  }, [accessType, mode]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  useEffect(() => {
    roleAccessApi
      .getRoles()
      .then((d) => setRoles(d.roles))
      .catch(() => showError('Failed to load roles'));
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setUsersLoading(true);
      roleAccessApi
        .getUsers(search.trim() || undefined)
        .then((d) => setUsers(d.users))
        .catch(() => showError('Failed to load users'))
        .finally(() => setUsersLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setSource(null);
    setHolders([]);
    if (!role || !user || accessType !== 'existing') return;
    setHoldersLoading(true);
    roleAccessApi
      .getRoleHolders(role.role_id, user.user_id)
      .then((d) => {
        setHolders(d.users);
        if (pendingSourceId.current) {
          setSource(d.users.find((h) => h.user_id === pendingSourceId.current) || null);
          pendingSourceId.current = null;
        }
      })
      .catch(() => showError('Failed to load users for this role'))
      .finally(() => setHoldersLoading(false));
  }, [role, user, accessType]);

  // Their own role can only be granted as "Same as existing user"
  const isOwnRole = !!user && !!role && role.role_id === user.role_id;
  useEffect(() => {
    if (isOwnRole) setAccessType('existing');
  }, [isOwnRole]);

  const dateError = !!endDate && endDate < startDate;
  const stepValid: Record<StepKey, boolean> = {
    user: !!user,
    role: !!role,
    type: !(isOwnRole && accessType === 'fresh'),
    source: !!source,
    period: !!endDate && !dateError && endDate >= today,
    review: accessType !== 'existing' || !!source,
  };

  const goTo = (index: number) => {
    setDirection(index > stepIndex ? 1 : -1);
    setStepIndex(index);
  };
  const next = () => stepValid[step] && stepIndex < steps.length - 1 && goTo(stepIndex + 1);
  const back = () => stepIndex > 0 && goTo(stepIndex - 1);

  const submit = async () => {
    if (saving || !user || !role || !stepValid.review) return;
    const details = {
      role_id: role.role_id,
      access_type: accessType,
      source_user_id: accessType === 'existing' ? source?.user_id ?? null : null,
      start_date: startDate,
      end_date: endDate,
    };
    try {
      setSaving(true);
      const result =
        mode === 'edit' && prefill
          ? await roleAccessApi.updateGrant(prefill.grant_id, details)
          : await roleAccessApi.createGrant({ user_id: user.user_id, ...details });
      setGranted(result.grant);
    } catch (error: any) {
      showError(error.response?.data?.error || 'Failed to save role access');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setUser(null);
    setRole(null);
    setAccessType('fresh');
    setSource(null);
    setStartDate(today);
    setEndDate('');
    setGranted(null);
    setDirection(-1);
    setStepIndex(0);
  };

  const summary =
    user && role && endDate
      ? `${user.full_name} (${roleLabel(user.role)}) gets ${roleLabel(role.role)} access` +
        (accessType === 'existing' && source
          ? ` with the same projects and data as ${source.full_name}`
          : ' as a fresh role, starting with no projects') +
        `, from ${formatDate(startDate)} until ${formatDate(endDate)}, 11:59 PM.`
      : '';

  const progressPct = steps.length > 1 ? (stepIndex / (steps.length - 1)) * 100 : 0;
  const meta = STEP_META[step];

  const slide = {
    initial: (dir: number) => ({ opacity: 0, x: dir * 40 }),
    animate: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * -40 }),
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-0 sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog"
        aria-label={TITLES[mode]}
        className="bg-gray-50 w-full max-w-5xl h-full sm:h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        initial={{ y: 30, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 30, scale: 0.98 }}
        transition={{ type: 'tween', duration: 0.25 }}
      >
        {/* Header */}
        <div className="bg-white flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <div className="text-xs font-bold tracking-wider text-[#243d8a]">ROLE ACCESS</div>
            <h2 className="text-xl font-bold text-gray-900">{TITLES[mode]}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step rail */}
        {!granted && (
          <div className="bg-white px-6 pt-4 pb-3 border-b border-gray-200 overflow-x-auto">
            <div className="relative" style={{ minWidth: steps.length * 96 }}>
              <div
                className="absolute top-[17px] h-1.5 bg-gray-200 rounded-full"
                style={{ left: `${50 / steps.length}%`, right: `${50 / steps.length}%` }}
              >
                <motion.div
                  className="h-full rounded-full bg-[repeating-linear-gradient(90deg,#243d8a_0_14px,#3B5BC4_14px_28px)]"
                  initial={false}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.5, ease: 'easeInOut' }}
                />
              </div>
              <div className="relative flex">
                {steps.map((s, i) => {
                  const done = i < stepIndex;
                  const current = i === stepIndex;
                  return (
                    <div key={s} className="flex-1 flex justify-center">
                      <button
                        onClick={() => i < stepIndex && goTo(i)}
                        disabled={i > stepIndex}
                        aria-label={`Step ${i + 1}: ${STEP_META[s].title}`}
                        className="flex flex-col items-center gap-1.5 disabled:cursor-default"
                      >
                        <span
                          className={`w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-extrabold transition-all ${
                            done
                              ? 'bg-[#243d8a] border-[#243d8a] text-white'
                              : current
                                ? 'bg-white border-[#243d8a] text-[#243d8a] scale-110 shadow-[0_0_0_6px_rgba(36,61,138,0.15)]'
                                : 'bg-white border-gray-300 text-gray-500'
                          }`}
                        >
                          {done ? <Check className="w-4 h-4" /> : i + 1}
                        </span>
                        <span className={`text-xs font-semibold ${current ? 'text-gray-900' : 'text-gray-500'}`}>
                          {STEP_META[s].short}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {granted ? (
            <SuccessView
              grant={granted}
              summary={summary}
              mode={mode}
              onAnother={reset}
              onDone={() => onGranted(granted)}
            />
          ) : (
            <div className="flex flex-col lg:flex-row gap-5 h-full">
              {/* Narrative card */}
              <div className="lg:w-80 shrink-0 bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full bg-[#243d8a]/10 text-[#243d8a] text-[11px] font-extrabold tracking-wide">
                    ADMIN / TD
                  </span>
                  <span className="text-xs font-semibold text-gray-500">
                    Step {stepIndex + 1} of {steps.length}
                  </span>
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2"
                  >
                    <h3 className="text-xl font-extrabold text-gray-900 leading-snug">{meta.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{meta.body}</p>
                  </motion.div>
                </AnimatePresence>
                {(user || role) && (
                  <div className="mt-auto bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1.5 text-xs">
                    <div className="font-bold tracking-wide text-gray-500">SO FAR</div>
                    {user && (
                      <div>
                        <span className="text-gray-500">User: </span>
                        <span className="font-semibold text-gray-900">{user.full_name}</span>
                      </div>
                    )}
                    {role && (
                      <div>
                        <span className="text-gray-500">Role: </span>
                        <span className="font-semibold text-gray-900">{roleLabel(role.role)}</span>
                      </div>
                    )}
                    {stepIndex > steps.indexOf('type') && (
                      <div>
                        <span className="text-gray-500">Access: </span>
                        <span className="font-semibold text-gray-900">
                          {accessType === 'fresh' ? 'Fresh role' : `Same as ${source?.full_name || 'existing user'}`}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-2xl p-5 overflow-hidden">
                <AnimatePresence mode="wait" custom={direction} initial={false}>
                  <motion.div
                    key={step}
                    custom={direction}
                    variants={slide}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="space-y-4"
                  >
                    {step === 'user' && (
                      <>
                        <label className="relative block">
                          <span className="sr-only">Search users</span>
                          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            autoFocus
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by name or email"
                            className="w-full pl-9 pr-3 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-[#243d8a]/30 focus:border-[#243d8a] outline-none"
                          />
                        </label>
                        <div className="max-h-[50vh] overflow-y-auto space-y-1.5 pr-1">
                          {usersLoading ? (
                            <div className="py-10 text-center text-sm text-gray-500">Loading users...</div>
                          ) : users.length === 0 ? (
                            <div className="py-10 text-center text-sm text-gray-500">No users found</div>
                          ) : (
                            users.map((u) => (
                              <PersonRow
                                key={u.user_id}
                                name={u.full_name}
                                sub={u.email}
                                right={roleLabel(u.role)}
                                selected={user?.user_id === u.user_id}
                                onClick={() => {
                                  if (user?.user_id !== u.user_id) setRole(null);
                                  setUser(u);
                                }}
                              />
                            ))
                          )}
                        </div>
                      </>
                    )}

                    {step === 'role' && user && (
                      <>
                        <div className="flex flex-wrap gap-2.5">
                          {roles.map((r) => {
                            const own = r.role_id === user.role_id;
                            const selected = role?.role_id === r.role_id;
                            return (
                              <button
                                key={r.role_id}
                                onClick={() => setRole(r)}
                                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold border-2 transition-all ${
                                  selected
                                    ? 'bg-[#243d8a] border-[#243d8a] text-white shadow-[0_0_0_5px_rgba(36,61,138,0.15)]'
                                    : 'bg-white border-gray-300 text-gray-800 hover:border-[#243d8a]'
                                }`}
                              >
                                {roleLabel(r.role)}
                                {own && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                      selected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                                    }`}
                                  >
                                    Own role
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <Hint>
                          {isOwnRole
                            ? `${user.full_name} is already a ${roleLabel(user.role)}. This grant shares another ${roleLabel(user.role)}'s projects and data with them (Same as existing user).`
                            : `${user.full_name}'s own role (${roleLabel(user.role)}) can be picked only to share another ${roleLabel(user.role)}'s access.`}
                        </Hint>
                      </>
                    )}

                    {step === 'type' && role && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <TypeCard
                          icon={<UserPlus className="w-5 h-5" />}
                          title="Fresh role"
                          body={
                            isOwnRole
                              ? `Not available: ${user?.full_name} is already a ${roleLabel(role.role)}.`
                              : `Starts empty as a new ${roleLabel(role.role)}: no projects or data copied from anyone. Projects are assigned to them later, and they appear in the ${roleLabel(role.role)} lists while access is active.`
                          }
                          selected={accessType === 'fresh'}
                          disabled={isOwnRole}
                          onClick={() => setAccessType('fresh')}
                        />
                        <TypeCard
                          icon={<Copy className="w-5 h-5" />}
                          title="Same as existing user"
                          body={`Gets the same projects and data as a ${roleLabel(role.role)} you choose in the next step.`}
                          selected={accessType === 'existing'}
                          onClick={() => setAccessType('existing')}
                        />
                      </div>
                    )}

                    {step === 'source' && role && (
                      <>
                        <div className="text-sm font-bold text-gray-700">
                          {roleLabel(role.role)} whose access to share
                        </div>
                        <div className="space-y-1.5">
                          {holdersLoading ? (
                            <div className="py-10 text-center text-sm text-gray-500">Loading...</div>
                          ) : holders.length === 0 ? (
                            <div className="py-8 text-center text-sm text-gray-500">
                              No other users have this role yet. Go back and choose Fresh role.
                            </div>
                          ) : (
                            holders.map((h) => (
                              <PersonRow
                                key={h.user_id}
                                name={h.full_name}
                                sub={h.project_count != null ? `${h.project_count} active projects` : h.email}
                                selected={source?.user_id === h.user_id}
                                onClick={() => setSource(h)}
                              />
                            ))
                          )}
                        </div>
                        {source && user && (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-[#243d8a]/5 rounded-xl p-4 text-sm text-gray-800"
                          >
                            {user.full_name} will see {source.full_name}'s projects, BOQs, change requests and approvals.
                          </motion.div>
                        )}
                        <Hint>While using this access, their actions are recorded under the chosen user's name.</Hint>
                      </>
                    )}

                    {step === 'period' && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <label className="flex flex-col gap-1.5 text-xs font-bold text-gray-600">
                            Start date
                            <input
                              type="date"
                              value={startDate}
                              min={editingActive ? undefined : today}
                              disabled={editingActive}
                              onChange={(e) => setStartDate(e.target.value)}
                              className="border border-gray-300 rounded-xl px-3 py-3 text-sm font-normal text-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-xs font-bold text-gray-600">
                            End date
                            <input
                              type="date"
                              value={endDate}
                              min={startDate}
                              onChange={(e) => setEndDate(e.target.value)}
                              className="border border-gray-300 rounded-xl px-3 py-3 text-sm font-normal text-gray-900"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-gray-500">Quick pick:</span>
                          {QUICK_PICKS.map((q) => {
                            const value = addDays(startDate, q.days);
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
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <CalendarClock className="w-4 h-4" /> Access ends automatically at 11:59 PM on the end date.
                        </div>
                        {editingActive && (
                          <Hint>
                            This access is in use, so its start date stays. If you changed the role, access type or shared user,
                            the current access ends now and the new access starts today.
                          </Hint>
                        )}
                        {dateError && (
                          <div className="text-xs font-bold text-red-700">End date must be on or after the start date.</div>
                        )}
                      </>
                    )}

                    {step === 'review' && user && role && (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <ReviewItem label="User" value={user.full_name} sub={`Own role: ${roleLabel(user.role)}`} />
                          <ReviewItem label="Granted role" value={roleLabel(role.role)} />
                          <ReviewItem
                            label="Access type"
                            value={accessType === 'fresh' ? 'Fresh role' : 'Same as existing user'}
                            sub={accessType === 'existing' && source ? `${source.full_name}'s access` : 'Starts with no projects'}
                          />
                          <ReviewItem
                            label="Period"
                            value={`${formatDate(startDate)} → ${formatDate(endDate)}`}
                            sub="Ends 11:59 PM on the end date"
                          />
                        </div>
                        <div className="flex items-start gap-2 bg-[#243d8a]/5 rounded-xl p-4 text-sm text-gray-800">
                          <ShieldCheck className="w-5 h-5 text-[#243d8a] shrink-0" />
                          {summary}
                        </div>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!granted && (
          <div className="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
            <button
              onClick={stepIndex === 0 ? onClose : back}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-300 font-semibold text-gray-700 hover:bg-gray-50"
            >
              {stepIndex === 0 ? (
                'Cancel'
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4" /> Back
                </>
              )}
            </button>
            {step === 'review' ? (
              <button
                onClick={submit}
                disabled={saving || !stepValid.review}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#243d8a] text-white font-bold hover:bg-[#1a2d66] disabled:opacity-60"
              >
                {saving ? 'Saving...' : mode === 'edit' ? 'Save changes' : mode === 'renew' ? 'Renew access' : 'Grant access'}
              </button>
            ) : (
              <button
                onClick={next}
                disabled={!stepValid[step]}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-[#243d8a] text-white font-bold hover:bg-[#1a2d66] disabled:bg-[#243d8a]/40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

// ---------------------------------------------------------------------------

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-start gap-2 text-xs text-gray-500">
    <Info className="w-4 h-4 shrink-0" />
    <span>{children}</span>
  </div>
);

const PersonRow: React.FC<{
  name: string;
  sub?: string | null;
  right?: string;
  selected: boolean;
  onClick: () => void;
}> = ({ name, sub, right, selected, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border-2 transition-all ${
      selected ? 'border-[#243d8a] bg-[#243d8a]/5 shadow-[0_0_0_4px_rgba(36,61,138,0.1)]' : 'border-transparent hover:bg-gray-50'
    }`}
  >
    <div className="w-9 h-9 rounded-full bg-[#243d8a]/10 text-[#243d8a] font-bold text-xs flex items-center justify-center shrink-0">
      {initials(name)}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-gray-900 truncate">{name}</div>
      {sub && <div className="text-xs text-gray-500 truncate">{sub}</div>}
    </div>
    {right && <span className="text-xs font-semibold text-gray-600">{right}</span>}
    {selected && <Check className="w-4 h-4 text-[#243d8a] shrink-0" />}
  </button>
);

const TypeCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  body: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}> = ({ icon, title, body, selected, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`text-left p-5 rounded-2xl border-2 transition-all ${
      disabled
        ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
        : selected
          ? 'border-[#243d8a] bg-[#243d8a]/5 shadow-[0_0_0_5px_rgba(36,61,138,0.12)]'
          : 'border-gray-200 hover:border-[#243d8a]/50'
    }`}
  >
    <div className="flex items-center gap-2 text-[#243d8a]">
      {icon}
      <span className="text-base font-bold text-gray-900">{title}</span>
      {selected && <Check className="w-4 h-4 ml-auto" />}
    </div>
    <p className="text-sm text-gray-600 mt-2 leading-relaxed">{body}</p>
  </button>
);

const ReviewItem: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="border border-gray-200 rounded-xl p-3">
    <div className="text-[11px] font-bold tracking-wide text-gray-500 uppercase">{label}</div>
    <div className="text-sm font-bold text-gray-900 mt-0.5">{value}</div>
    {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
  </div>
);

const SuccessView: React.FC<{
  grant: RoleGrant;
  summary: string;
  mode: WizardMode;
  onAnother: () => void;
  onDone: () => void;
}> = ({ grant, summary, mode, onAnother, onDone }) => (
  <div className="h-full flex flex-col items-center justify-center text-center gap-5 py-10">
    <motion.div
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center"
    >
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <motion.path
          d="M5 12l5 5 9-10"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
        />
      </svg>
    </motion.div>
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="space-y-2 max-w-xl">
      <h3 className="text-2xl font-extrabold text-gray-900">
        {mode === 'edit'
          ? 'Access updated'
          : grant.status === 'scheduled'
            ? 'Access scheduled'
            : mode === 'renew'
              ? 'Access renewed'
              : 'Access granted'}
      </h3>
      <p className="text-gray-600">{summary}</p>
      <p className="text-sm text-gray-500">
        {grant.user_name} has been notified. They can log in with the same email and pick {roleLabel(grant.role)}, or
        switch from their account menu.
      </p>
    </motion.div>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="flex gap-3">
      {mode === 'create' && (
        <button
          onClick={onAnother}
          className="px-5 py-2.5 rounded-xl border border-gray-300 font-semibold text-gray-700 hover:bg-gray-50"
        >
          Grant another
        </button>
      )}
      <button onClick={onDone} className="px-6 py-2.5 rounded-xl bg-[#243d8a] text-white font-bold hover:bg-[#1a2d66]">
        Done
      </button>
    </motion.div>
  </div>
);

export default RoleAccessWizard;
