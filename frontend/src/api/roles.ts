/**
 * API service for fetching roles
 */

import { API_BASE_URL } from './config';

export interface Role {
  id: string;
  title: string;
  description: string;
  tier: string;
  color: string;
  icon: string;
}

/**
 * Fetch all available roles from backend
 */
export async function fetchRoles(): Promise<Role[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/roles`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch roles');
    }

    const data = await response.json();
    return data.roles || [];
  } catch (error) {
    console.error('Error fetching roles:', error);
    // Return default roles if API fails
    return getDefaultRoles();
  }
}

/**
 * Get default roles matching backend configuration
 * These match exactly with the Material Purchases workflow diagram
 */
export function getDefaultRoles(): Role[] {
  return [
    {
      id: 'siteSupervisor',
      title: 'Site Supervisor',
      description: 'Site Supervisor - Site operations and material requisition',
      tier: 'Operations',
      color: '#ea580c',
      icon: 'HardHat'
    },
    {
      id: 'mepSupervisor',
      title: 'MEP Supervisor',
      description: 'MEP Supervisor - MEP operations and material requisition',
      tier: 'Operations',
      color: '#0891b2',
      icon: 'Activity'
    },
    {
      id: 'procurement',
      title: 'Procurement',
      description: 'Procurement - Procurement and vendor management',
      tier: 'Support',
      color: '#dc2626',
      icon: 'ShoppingCart'
    },
    {
      id: 'projectManager',
      title: 'Project Manager',
      description: 'Project Manager - Project coordination and approvals',
      tier: 'Management',
      color: '#059669',
      icon: 'UserCheck'
    },
    {
      id: 'design',
      title: 'Design',
      description: 'Design - Design reference and technical inputs',
      tier: 'Technical',
      color: '#8b5cf6',
      icon: 'Layers'
    },
    {
      id: 'estimation',
      title: 'Estimation',
      description: 'Estimation - Cost estimation and validation',
      tier: 'Technical',
      color: '#f59e0b',
      icon: 'Calculator'
    },
    {
      id: 'accounts',
      title: 'Accounts',
      description: 'Accounts - Financial management and payments',
      tier: 'Support',
      color: '#16a34a',
      icon: 'DollarSign'
    },
    {
      id: 'technicalDirector',
      title: 'Technical Director',
      description: 'Technical Director - Final approvals and technical decisions',
      tier: 'Management',
      color: '#1e40af',
      icon: 'Briefcase'
    }
  ];
}