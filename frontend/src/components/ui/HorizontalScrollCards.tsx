import React, { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useResponsive } from '@/hooks/useResponsive';

interface StatCard {
  id: string;
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isUp: boolean;
  };
  color?: string;
  bgColor?: string;
}

interface HorizontalScrollCardsProps {
  cards: StatCard[];
  className?: string;
}

export const HorizontalScrollCards: React.FC<HorizontalScrollCardsProps> = ({
  cards,
  className = ''
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const { isMobile } = useResponsive();

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  useEffect(() => {
    checkScroll();
    const handleResize = () => checkScroll();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [cards]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const cardWidth = isMobile ? 200 : 250; // Approximate card width
      const scrollAmount = direction === 'left' ? -cardWidth : cardWidth;
      scrollRef.current.scrollBy({
        left: scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <>
      {/* Desktop layout - grid (hidden on mobile) */}
      <div className={cn("hidden md:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4", className)}>
        {cards.map((card) => (
          <Card key={card.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-600 truncate">{card.title}</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{card.value}</p>
                  {card.subtitle && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{card.subtitle}</p>
                  )}
                  {card.trend && (
                    <div className="flex items-center gap-1 mt-2">
                      <span className={cn(
                        "text-xs font-medium",
                        card.trend.isUp ? "text-green-600" : "text-red-600"
                      )}>
                        {card.trend.isUp ? '↑' : '↓'} {Math.abs(card.trend.value)}%
                      </span>
                      <span className="text-xs text-gray-500">vs last month</span>
                    </div>
                  )}
                </div>
                {card.icon && (
                  <div className={cn(
                    "p-2 rounded-lg flex-shrink-0",
                    card.bgColor || "bg-gray-100"
                  )}>
                    {card.icon}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Mobile layout - horizontal scroll (visible only on mobile) */}
      <div className={cn("md:hidden relative", className)}>
        {/* Scroll buttons */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 backdrop-blur-sm rounded-full p-1 shadow-lg"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/90 backdrop-blur-sm rounded-full p-1 shadow-lg"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

      {/* Scrollable container */}
      <div 
        ref={scrollRef}
        onScroll={checkScroll}
        className="overflow-x-auto scrollbar-hide -mx-3 px-3"
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch' 
        }}
      >
        <div className="flex gap-3 pb-2">
          {cards.map((card) => (
            <Card 
              key={card.id} 
              className="border-0 shadow-sm flex-shrink-0 w-[180px] xxs:w-[200px]"
            >
              <CardContent className="p-3">
                <div className="flex flex-col">
                  {/* Icon and title row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs text-gray-600 font-medium flex-1">{card.title}</p>
                    {card.icon && (
                      <div className={cn(
                        "p-1.5 rounded-md flex-shrink-0",
                        card.bgColor || "bg-gray-100"
                      )}>
                        {React.cloneElement(card.icon as React.ReactElement, {
                          className: "w-3 h-3"
                        })}
                      </div>
                    )}
                  </div>
                  
                  {/* Value */}
                  <p className="text-lg font-bold text-gray-900">{card.value}</p>
                  
                  {/* Trend or subtitle */}
                  {card.trend ? (
                    <div className="flex items-center gap-1 mt-1">
                      <span className={cn(
                        "text-xs font-medium",
                        card.trend.isUp ? "text-green-600" : "text-red-600"
                      )}>
                        {card.trend.isUp ? '↑' : '↓'} {Math.abs(card.trend.value)}%
                      </span>
                      <span className="text-xs text-gray-500">vs last</span>
                    </div>
                  ) : card.subtitle && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{card.subtitle}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

        {/* Scroll indicators */}
        <div className="flex justify-center gap-1 mt-2">
          {cards.map((_, index) => (
            <div
              key={index}
              className={cn(
                "h-1 rounded-full transition-all",
                index === 0 ? "w-3 bg-gray-400" : "w-1 bg-gray-300"
              )}
            />
          ))}
        </div>
      </div>
    </>
  );
};

// Compact version for very small spaces
export const CompactStatCards: React.FC<HorizontalScrollCardsProps> = ({
  cards,
  className = ''
}) => {
  const { isMobile } = useResponsive();

  if (!isMobile) {
    return <HorizontalScrollCards cards={cards} className={className} />;
  }

  return (
    <div className={cn("overflow-x-auto scrollbar-hide -mx-3 px-3", className)}>
      <div className="flex gap-2 pb-2">
        {cards.map((card) => (
          <div 
            key={card.id}
            className="flex-shrink-0 bg-white rounded-lg border border-gray-200 p-2 min-w-[140px]"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-gray-600">{card.title}</p>
                <p className="text-base font-bold text-gray-900">{card.value}</p>
                {card.trend && (
                  <span className={cn(
                    "text-xs",
                    card.trend.isUp ? "text-green-600" : "text-red-600"
                  )}>
                    {card.trend.isUp ? '↑' : '↓'}{Math.abs(card.trend.value)}%
                  </span>
                )}
              </div>
              {card.icon && (
                <div className="text-gray-400">
                  {React.cloneElement(card.icon as React.ReactElement, {
                    className: "w-4 h-4"
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};