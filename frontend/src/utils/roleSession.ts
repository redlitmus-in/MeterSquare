/**
 * Multi-role access: switching the signed-in user between their own role and
 * roles granted to them (Role Access page). A switch issues a new token, so the
 * app reloads into the new role's dashboard with a clean state.
 */
import { roleAccessApi, SwitchRoleResponse } from '@/api/roleAccess';
import { useAuthStore } from '@/store/authStore';
import { getRoleDashboardPath, getRoleDisplayName } from '@/utils/roleRouting';

const NOTICE_KEY = 'role-switch-notice';
const OVERLAY_ID = 'role-switch-overlay';

/** Full-screen "Switching to ..." overlay. Plain DOM so it stays until the page reloads. */
function showSwitchOverlay(title: string) {
  if (typeof document === 'undefined') return;
  hideSwitchOverlay();
  if (!document.getElementById('role-switch-overlay-style')) {
    const style = document.createElement('style');
    style.id = 'role-switch-overlay-style';
    style.textContent =
      '@keyframes rs-spin{to{transform:rotate(360deg)}}@keyframes rs-in{from{opacity:0}to{opacity:1}}';
    document.head.appendChild(style);
  }
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(255,255,255,.82);backdrop-filter:blur(3px);animation:rs-in .15s ease both;';

  const card = document.createElement('div');
  card.style.cssText =
    'background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px 36px;max-width:90vw;' +
    'box-shadow:0 20px 50px rgba(20,33,61,.18);display:flex;flex-direction:column;align-items:center;gap:14px;';
  const spinner = document.createElement('div');
  spinner.style.cssText =
    'width:44px;height:44px;border-radius:50%;border:4px solid #dbe2f3;border-top-color:#243d8a;' +
    'animation:rs-spin .8s linear infinite;';
  const heading = document.createElement('div');
  heading.style.cssText = 'font-size:16px;font-weight:700;color:#111827;text-align:center;';
  heading.textContent = title;
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:13px;color:#6b7280;';
  sub.textContent = 'Loading your dashboard...';

  card.append(spinner, heading, sub);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function hideSwitchOverlay() {
  if (typeof document === 'undefined') return;
  document.getElementById(OVERLAY_ID)?.remove();
}

// One switch at a time (double clicks, banner + menu, expiry handler)
let switchInFlight: Promise<SwitchRoleResponse> | null = null;

function isValidSession(result: SwitchRoleResponse | undefined): result is SwitchRoleResponse {
  return (
    !!result &&
    typeof result.access_token === 'string' &&
    result.access_token.split('.').length === 3 &&
    !!result.user &&
    typeof result.user.role === 'string'
  );
}

async function requestSwitch(grantId: number | null): Promise<SwitchRoleResponse> {
  if (!switchInFlight) {
    switchInFlight = roleAccessApi.switchRole(grantId).finally(() => {
      switchInFlight = null;
    });
  }
  const result = await switchInFlight;
  if (!isValidSession(result)) {
    throw new Error('Role switch failed: the server did not return a new session.');
  }
  return result;
}

function applySession(result: SwitchRoleResponse) {
  localStorage.setItem('access_token', result.access_token);
  localStorage.setItem('user', JSON.stringify(result.user));
  // Admin "view as role" belongs to the previous session
  localStorage.removeItem('admin-view-storage');
  useAuthStore.setState({ user: result.user, isAuthenticated: true, isLoading: false, error: null });
}

function roleLabel(role: string) {
  const label = getRoleDisplayName(role);
  return label === 'User' ? role : label;
}

/**
 * Switch to a granted role (grantId) or back to the user's own role (null).
 * targetLabel is shown in the loading overlay, e.g. "Procurement".
 */
export async function switchToRole(grantId: number | null, targetLabel?: string): Promise<void> {
  showSwitchOverlay(targetLabel ? `Switching to ${targetLabel}...` : 'Switching role...');
  let result: SwitchRoleResponse;
  try {
    result = await requestSwitch(grantId);
  } catch (error) {
    hideSwitchOverlay();
    throw error;
  }
  applySession(result);
  try {
    sessionStorage.setItem(NOTICE_KEY, `You're now working as ${roleLabel(result.user.role)}.`);
  } catch {}
  window.location.replace(getRoleDashboardPath(result.user.role));
}

let handlingExpiry = false;

/** Called when the server reports that the session's granted role has ended. */
export async function handleRoleAccessExpired(message?: string): Promise<void> {
  if (handlingExpiry) return;
  handlingExpiry = true;
  showSwitchOverlay('Your role access has ended. Returning to your role...');
  try {
    const result = await requestSwitch(null);
    applySession(result);
    try {
      sessionStorage.setItem(
        NOTICE_KEY,
        `${message || 'Your access to that role has ended.'} You're back in ${roleLabel(result.user.role)}.`
      );
    } catch {}
    window.location.replace(getRoleDashboardPath(result.user.role));
  } catch {
    // Could not restore the own-role session: sign in again
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth-storage');
    window.location.replace('/login');
  }
}

/** One-time message shown after a role switch reload. */
export function takeRoleSwitchNotice(): string | null {
  try {
    const notice = sessionStorage.getItem(NOTICE_KEY);
    if (notice) sessionStorage.removeItem(NOTICE_KEY);
    return notice;
  } catch {
    return null;
  }
}
