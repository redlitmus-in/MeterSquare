/**
 * Workflow-based roles configuration
 * Based on Material Purchases - Project Bound workflow
 */

import { 
  HardHat, 
  Activity, 
  ShoppingCart, 
  UserCheck, 
  Layers, 
  Calculator, 
  DollarSign, 
  Briefcase 
} from 'lucide-react';

export interface WorkflowRole {
  id: string;
  title: string;
  description: string;
  tier: string;
  color: string;
  icon: any;
  gradientColor: string;
}

/**
 * Roles from the actual workflow diagram
 */
export const WORKFLOW_ROLES: WorkflowRole[] = [
  {
    id: 'siteSupervisor',
    title: 'Site Supervisor',
    description: 'Site operations and material requisition',
    tier: 'Operations',
    color: '#ea580c',
    icon: HardHat,
    gradientColor: 'from-orange-500 to-red-600'
  },
  {
    id: 'mepSupervisor',
    title: 'MEP Supervisor',
    description: 'MEP operations and material requisition',
    tier: 'Operations',
    color: '#0891b2',
    icon: Activity,
    gradientColor: 'from-cyan-500 to-blue-600'
  },
  {
    id: 'procurement',
    title: 'Procurement',
    description: 'Procurement and vendor management',
    tier: 'Support',
    color: '#dc2626',
    icon: ShoppingCart,
    gradientColor: 'from-red-500 to-pink-600'
  },
  {
    id: 'projectManager',
    title: 'Project Manager',
    description: 'Project coordination and approvals',
    tier: 'Management',
    color: '#059669',
    icon: UserCheck,
    gradientColor: 'from-green-500 to-emerald-600'
  },
  {
    id: 'design',
    title: 'Design',
    description: 'Design reference and technical inputs',
    tier: 'Technical',
    color: '#8b5cf6',
    icon: Layers,
    gradientColor: 'from-purple-500 to-indigo-600'
  },
  {
    id: 'estimation',
    title: 'Estimation',
    description: 'Cost estimation and validation',
    tier: 'Technical',
    color: '#f59e0b',
    icon: Calculator,
    gradientColor: 'from-amber-500 to-orange-600'
  },
  {
    id: 'accounts',
    title: 'Accounts',
    description: 'Financial management and payments',
    tier: 'Support',
    color: '#16a34a',
    icon: DollarSign,
    gradientColor: 'from-green-600 to-teal-600'
  },
  {
    id: 'technicalDirector',
    title: 'Technical Director',
    description: 'Final approvals and technical decisions',
    tier: 'Management',
    color: '#1e40af',
    icon: Briefcase,
    gradientColor: 'from-blue-600 to-indigo-700'
  }
];

/**
 * Workflow flags (approval gates)
 */
export const WORKFLOW_FLAGS = {
  'QTY_SPEC_FLAG': {
    name: 'Quantity & Specification Flag',
    checkBy: ['procurement', 'projectManager'],
    color: 'bg-pink-100 text-pink-800'
  },
  'PM_FLAG': {
    name: 'Project Manager Flag',
    checkBy: ['projectManager'],
    color: 'bg-purple-100 text-purple-800'
  },
  'COST_FLAG': {
    name: 'Cost Flag',
    checkBy: ['estimation', 'projectManager'],
    color: 'bg-red-100 text-red-800'
  },
  'FLAG': {
    name: 'Technical Flag',
    checkBy: ['technicalDirector'],
    color: 'bg-blue-100 text-blue-800'
  }
};

/**
 * Get role by ID
 */
export function getRoleById(roleId: string): WorkflowRole | undefined {
  return WORKFLOW_ROLES.find(role => role.id === roleId);
}

/**
 * Get roles for dropdown
 */
export function getRolesForDropdown() {
  return WORKFLOW_ROLES.map(role => ({
    value: role.id,
    label: role.title,
    icon: role.icon,
    color: role.gradientColor
  }));
}