/**
 * Role access grants that give only some of a role's menus.
 * The backend sends the hidden pages as role-less base paths (user.role_access.active_blocked_routes,
 * e.g. '/vendors'); the server also blocks their API calls. Normal sessions have none.
 */
import { extractBasePath } from '@/utils/roleRouting';

export const blockedRoutesOf = (user: any): string[] => user?.role_access?.active_blocked_routes || [];

export const isBlockedPath = (path: string, blocked: string[]): boolean => {
  if (!blocked.length || !path || path.startsWith('#')) return false;
  const base = extractBasePath(path);
  return blocked.some((r) => base === r || base.startsWith(`${r}/`));
};

interface NavItem {
  href: string;
  children?: NavItem[];
}

/** Sidebar items without the hidden menus; a group keeps only its visible sub-items. */
export function withoutBlockedMenus<T extends NavItem>(items: T[], blocked: string[]): T[] {
  if (!blocked.length) return items;
  const result: T[] = [];
  items.forEach((item) => {
    if (item.children?.length) {
      const children = item.children.filter((c) => !isBlockedPath(c.href, blocked));
      if (!children.length) return;
      const href = isBlockedPath(item.href, blocked) ? children[0].href : item.href;
      result.push({ ...item, href, children });
    } else if (!isBlockedPath(item.href, blocked)) {
      result.push(item);
    }
  });
  return result;
}
