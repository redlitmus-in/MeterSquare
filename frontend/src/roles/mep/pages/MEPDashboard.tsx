/**
 * MEP Dashboard Component
 *
 * This component wraps ProjectManagerHub with MEP-specific context.
 * ProjectManagerHub already detects MEP role and fetches from MEP API endpoints.
 *
 * MEP (Management level) has similar functionality to PM but:
 * - Filters projects by mep_supervisor_id instead of user_id
 * - Does not deal with labour requisitions (no Labour Status chart)
 * - Uses cyan theme instead of blue
 */

import React from 'react';
import ProjectManagerHub from '@/roles/project-manager/pages/ProjectManagerHub';

const MEPDashboard: React.FC = () => {
  // ProjectManagerHub automatically detects MEP role via:
  // 1. URL path containing '/mep/'
  // 2. User role being 'mep', 'mep supervisor', or 'mep_supervisor'
  //
  // When MEP is detected, it:
  // - Fetches from /mep_dashboard API endpoint
  // - Hides Labour Status chart (MEP doesn't deal with labour)
  // - Uses cyan theme colors
  // - Shows "MEP Supervisor Dashboard" title

  return <ProjectManagerHub />;
};

export default MEPDashboard;
