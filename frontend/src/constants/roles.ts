/**
 * Role Constants
 * Centralized role IDs and names to prevent hardcoding
 */

// Role IDs (matching backend database)
export const ROLE_IDS = {
  TECHNICAL_DIRECTOR: 7,
  ESTIMATOR: 4,
  PROJECT_MANAGER: 6,
  SITE_ENGINEER: 3,
  ADMIN: 5
} as const;

// Role Names (matching backend)
export const ROLE_NAMES = {
  TECHNICAL_DIRECTOR: 'technical_director',
  ESTIMATOR: 'estimator',
  PROJECT_MANAGER: 'project_manager',
  SITE_ENGINEER: 'site_supervisor', // Backend uses 'site_supervisor'
  ADMIN: 'admin'
} as const;

// Display Names (for UI)
export const ROLE_DISPLAY_NAMES = {
  [ROLE_IDS.TECHNICAL_DIRECTOR]: 'Technical Director',
  [ROLE_IDS.ESTIMATOR]: 'Estimator',
  [ROLE_IDS.PROJECT_MANAGER]: 'Project Manager',
  [ROLE_IDS.SITE_ENGINEER]: 'Site Engineer',
  [ROLE_IDS.ADMIN]: 'Administrator'
} as const;

// Type definitions
export type RoleId = typeof ROLE_IDS[keyof typeof ROLE_IDS];
export type RoleName = typeof ROLE_NAMES[keyof typeof ROLE_NAMES];
