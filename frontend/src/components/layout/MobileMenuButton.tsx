import React from 'react';
import { Menu } from 'lucide-react';

interface MobileMenuButtonProps {
  onClick: () => void;
}

export const MobileMenuButton: React.FC<MobileMenuButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="fixed top-3 left-3 z-40 p-2.5 bg-white rounded-xl shadow-lg hover:shadow-xl active:scale-95 transition-all duration-200 md:hidden border border-gray-100"
      aria-label="Open menu"
    >
      <Menu className="w-6 h-6 text-gray-700" />
    </button>
  );
};