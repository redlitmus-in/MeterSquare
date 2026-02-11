/**
 * Centralized role normalization utility.
 * Converts any role format (camelCase, snake_case, spaces, IDs) to a URL-friendly slug.
 * Used across notifications, routing, and realtime filtering.
 */

const ROLE_SLUG_MAP: Record<string, string> = {
  // Technical Director
  'technicaldirector': 'technical-director',
  'technical_director': 'technical-director',
  'technical-director': 'technical-director',
  'td': 'technical-director',
  // Project Manager
  'projectmanager': 'project-manager',
  'project_manager': 'project-manager',
  'project-manager': 'project-manager',
  'pm': 'project-manager',
  // Production Manager
  'productionmanager': 'production-manager',
  'production_manager': 'production-manager',
  'production-manager': 'production-manager',
  // Site Engineer
  'siteengineer': 'site-engineer',
  'site_engineer': 'site-engineer',
  'site-engineer': 'site-engineer',
  'se': 'site-engineer',
  // Site Supervisor
  'sitesupervisor': 'site-supervisor',
  'site_supervisor': 'site-supervisor',
  'site-supervisor': 'site-supervisor',
  // Buyer / Procurement
  'buyer': 'buyer',
  'procurement': 'buyer',
  // Estimator
  'estimator': 'estimator',
  'estimation': 'estimator',
  // MEP
  'mep': 'mep',
  'mepsupervisor': 'mep-supervisor',
  'mep_supervisor': 'mep-supervisor',
  'mep-supervisor': 'mep-supervisor',
  // Admin
  'admin': 'admin',
  'administrator': 'admin',
  // Accounts
  'accounts': 'accounts',
  // Design
  'design': 'design',
};

/**
 * Normalize any role string to a URL-friendly slug.
 * Handles camelCase, snake_case, kebab-case, spaces, and abbreviations.
 *
 * @example
 *   normalizeRole('technicalDirector') => 'technical-director'
 *   normalizeRole('site_engineer')     => 'site-engineer'
 *   normalizeRole('Buyer')             => 'buyer'
 *   normalizeRole('TD')                => 'technical-director'
 */
export function normalizeRole(role: string | number | null | undefined): string {
  if (!role) return '';
  const str = String(role).toLowerCase().replace(/[\s\-_]/g, '');
  return ROLE_SLUG_MAP[str] || str;
}

/**
 * Check if two roles refer to the same role (after normalization).
 */
export function rolesMatch(a: string, b: string): boolean {
  return normalizeRole(a) === normalizeRole(b);
}
