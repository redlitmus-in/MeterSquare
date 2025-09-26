import React from 'react';

interface CurrencyAedProps {
  className?: string;
}

export const CurrencyAed: React.FC<CurrencyAedProps> = ({ className = "w-5 h-5" }) => {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <text 
        x="50%" 
        y="50%" 
        dominantBaseline="middle" 
        textAnchor="middle" 
        fill="currentColor"
        stroke="none"
        fontSize="14"
        fontWeight="bold"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        د.إ
      </text>
    </svg>
  );
};

// Alternative simple text-based component
export const AedIcon: React.FC<{ className?: string }> = ({ className = "text-sm font-bold" }) => {
  return <span className={className}>AED</span>;
};

export default CurrencyAed;