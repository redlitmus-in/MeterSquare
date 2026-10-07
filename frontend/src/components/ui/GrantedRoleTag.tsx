/**
 * Small tag shown next to a user in a role picker when they are listed through
 * a temporary role grant (Role Access page), e.g. "Granted · until 7 Oct".
 */
import React from 'react';

interface GrantedRoleTagProps {
  /** ISO date (YYYY-MM-DD) the grant ends; nothing renders when empty */
  until?: string | null;
  className?: string;
}

const GrantedRoleTag: React.FC<GrantedRoleTagProps> = ({ until, className = '' }) => {
  if (!until) return null;
  const label = new Date(`${until}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <span
      title={`Temporary role access until ${label}, 11:59 PM`}
      className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 whitespace-nowrap bg-amber-100 text-amber-800 ${className}`}
    >
      Granted · until {label}
    </span>
  );
};

export default GrantedRoleTag;
