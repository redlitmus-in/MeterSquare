/**
 * DeadlineBadge — shared component for project deadline warnings.
 *
 * Usage:
 *   <DeadlineBadge endDate={project.end_date} status={project.status} />
 *
 * Thresholds:
 *   > 7 days  → no badge
 *   4–7 days  → yellow warning
 *   1–3 days  → red critical
 *   today     → red "Due today"
 *   overdue   → pulsing red "X days overdue"
 *
 * Does NOT render if project status is 'completed' or 'cancelled'.
 */

import React from 'react';

type DeadlineLevel = 'none' | 'warning' | 'critical' | 'overdue';

interface DeadlineStatus {
  level: DeadlineLevel;
  daysRemaining: number;
  label: string;
}

const INACTIVE_STATUSES = ['completed', 'cancelled', 'on hold'];

/**
 * Pure function — returns deadline classification for a given end_date + status.
 * Exported so you can use it without rendering the badge (e.g. for card border color).
 */
export function getDeadlineStatus(
  endDate: string | null | undefined,
  status: string | null | undefined
): DeadlineStatus {
  const noDeadline: DeadlineStatus = { level: 'none', daysRemaining: 0, label: '' };

  if (!endDate) return noDeadline;

  const normalizedStatus = (status || '').toLowerCase().replace(/_/g, ' ');
  if (INACTIVE_STATUSES.includes(normalizedStatus)) return noDeadline;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(endDate);
  deadline.setHours(0, 0, 0, 0);

  const diffMs = deadline.getTime() - today.getTime();
  const daysRemaining = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining > 7) return noDeadline;

  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    return {
      level: 'overdue',
      daysRemaining,
      label: `${overdueDays} day${overdueDays !== 1 ? 's' : ''} overdue`,
    };
  }

  if (daysRemaining === 0) {
    return { level: 'critical', daysRemaining: 0, label: 'Due today' };
  }

  if (daysRemaining <= 3) {
    return {
      level: 'critical',
      daysRemaining,
      label: `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left`,
    };
  }

  return {
    level: 'warning',
    daysRemaining,
    label: `${daysRemaining} days left`,
  };
}

interface DeadlineBadgeProps {
  endDate: string | null | undefined;
  status: string | null | undefined;
  /** 'default' = standard badge, 'compact' = smaller for dashboard cards */
  size?: 'default' | 'compact';
  className?: string;
}

/**
 * Renders a color-coded badge based on how close the project deadline is.
 * Returns null if no warning is needed.
 */
export function DeadlineBadge({
  endDate,
  status,
  size = 'default',
  className = '',
}: DeadlineBadgeProps): React.ReactElement | null {
  const deadline = getDeadlineStatus(endDate, status);
  if (deadline.level === 'none') return null;

  const isCompact = size === 'compact';

  const baseClasses = isCompact
    ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border-2'
    : 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border-2';

  let colorClasses: string;
  let icon: string;

  if (deadline.level === 'overdue') {
    colorClasses = 'bg-red-600 text-white border-red-800 animate-pulse shadow-md shadow-red-400';
    icon = '🚨';
  } else if (deadline.level === 'critical') {
    colorClasses = 'bg-red-500 text-white border-red-700 animate-pulse shadow-md shadow-red-300';
    icon = '🔴';
  } else {
    colorClasses = 'bg-yellow-400 text-yellow-900 border-yellow-600 animate-pulse shadow-md shadow-yellow-300';
    icon = '⚠️';
  }

  return (
    <span className={`${baseClasses} ${colorClasses} ${className}`}>
      <span>{icon}</span>
      <span>{deadline.label}</span>
    </span>
  );
}
