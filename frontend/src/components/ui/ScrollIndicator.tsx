import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrollIndicatorProps {
  children: React.ReactNode;
  className?: string;
  showButtons?: boolean;
  fadeEdges?: boolean;
}

export const ScrollIndicator: React.FC<ScrollIndicatorProps> = ({
  children,
  className = '',
  showButtons = false,
  fadeEdges = true
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.75;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className={cn("relative", className)}>
      {/* Left fade/button */}
      {fadeEdges && canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
      )}
      {showButtons && canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-gray-200 rounded-full p-1 shadow-md hover:shadow-lg transition-shadow"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        {children}
      </div>

      {/* Right fade/button */}
      {fadeEdges && canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
      )}
      {showButtons && canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-gray-200 rounded-full p-1 shadow-md hover:shadow-lg transition-shadow"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Mobile scroll hint */}
      {(canScrollLeft || canScrollRight) && (
        <div className="text-center mt-2 md:hidden">
          <span className="text-xs text-gray-500">
            {canScrollLeft && canScrollRight ? '← Swipe to see more →' : 
             canScrollLeft ? '← Swipe left' : 
             'Swipe right →'}
          </span>
        </div>
      )}
    </div>
  );
};

// Horizontal scroll wrapper for charts
interface ChartScrollWrapperProps {
  children: React.ReactNode;
  minWidth?: string;
  className?: string;
}

export const ChartScrollWrapper: React.FC<ChartScrollWrapperProps> = ({
  children,
  minWidth = '600px',
  className = ''
}) => {
  return (
    <ScrollIndicator className={className} fadeEdges showButtons>
      <div style={{ minWidth }}>
        {children}
      </div>
    </ScrollIndicator>
  );
};