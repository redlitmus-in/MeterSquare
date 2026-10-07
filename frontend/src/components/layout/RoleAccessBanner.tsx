/**
 * Shown while the user works in a role granted from the Role Access page:
 * which role, whose access (if shared), when it ends, and a one-click way back.
 * Also shows the one-time notice after a role switch.
 */
import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getRoleDisplayName } from '@/utils/roleRouting';
import { showInfo } from '@/utils/toastHelper';
import { switchToRole, takeRoleSwitchNotice } from '@/utils/roleSession';

const formatEnd = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const roleLabel = (role?: string) => {
  if (!role) return '';
  const label = getRoleDisplayName(role);
  return label === 'User' ? role : label;
};

const RoleAccessBanner: React.FC = () => {
  const user = useAuthStore((s) => s.user) as any;
  const [switching, setSwitching] = useState(false);
  const roleAccess = user?.role_access;

  useEffect(() => {
    const notice = takeRoleSwitchNotice();
    if (notice) showInfo(notice);
  }, []);

  if (!roleAccess?.active_grant_id) return null;

  const role = roleLabel(user.role);
  const ownRole = roleLabel(roleAccess.primary_role);

  const backToOwn = async () => {
    if (switching) return;
    setSwitching(true);
    try {
      await switchToRole(null, ownRole);
    } catch {
      setSwitching(false);
    }
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:px-6 py-2.5 bg-amber-100 text-amber-900 text-sm font-medium border-b border-amber-200"
    >
      <span>
        You're working as <strong>{role}</strong>
        {roleAccess.active_access_type === 'existing' && roleAccess.active_source_user_name
          ? ` with ${roleAccess.active_source_user_name}'s access`
          : roleAccess.active_access_type === 'fresh'
            ? ' (fresh role)'
            : ''}
        {roleAccess.active_end_date ? `. Ends ${formatEnd(roleAccess.active_end_date)}, 11:59 PM.` : '.'}
      </span>
      <button
        onClick={backToOwn}
        disabled={switching}
        className="px-3 py-1.5 rounded-md border border-amber-700 text-amber-900 text-xs font-bold hover:bg-amber-200 disabled:opacity-60"
      >
        {switching ? 'Switching...' : `Switch back to ${ownRole}`}
      </button>
    </div>
  );
};

export default RoleAccessBanner;
