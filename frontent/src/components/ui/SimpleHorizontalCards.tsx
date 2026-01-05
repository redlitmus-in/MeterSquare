import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

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

interface SimpleHorizontalCardsProps {
  cards: StatCard[];
  className?: string;
}

export const SimpleHorizontalCards: React.FC<SimpleHorizontalCardsProps> = ({
  cards,
  className = ''
}) => {
  return (
    <div className={className}>
      {/* Desktop Grid - Hidden on mobile */}
      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <Card key={card.id} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="text-sm text-gray-600">{card.title}</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{card.value}</p>
                  {card.trend && (
                    <div className="flex items-center gap-1 mt-2">
                      <span className={cn(
                        "text-xs font-medium",
                        card.trend.isUp ? "text-green-600" : "text-red-600"
                      )}>
                        {card.trend.isUp ? '↑' : '↓'} {card.trend.value}%
                      </span>
                      <span className="text-xs text-gray-500">vs last</span>
                    </div>
                  )}
                </div>
                {card.icon && (
                  <div className={cn("p-2 rounded-lg", card.bgColor || "bg-gray-100")}>
                    {card.icon}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Mobile Horizontal Scroll - Only visible on mobile */}
      <div className="sm:hidden overflow-x-auto">
        <div className="flex gap-3 pb-2" style={{ minWidth: 'min-content' }}>
          {cards.map((card) => (
            <Card key={card.id} className="border-0 shadow-sm flex-shrink-0 w-48">
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-xs text-gray-600">{card.title}</p>
                    <p className="text-lg font-bold text-gray-900">{card.value}</p>
                    {card.trend && (
                      <div className="mt-1">
                        <span className={cn(
                          "text-xs font-medium",
                          card.trend.isUp ? "text-green-600" : "text-red-600"
                        )}>
                          {card.trend.isUp ? '↑' : '↓'} {card.trend.value}%
                        </span>
                      </div>
                    )}
                  </div>
                  {card.icon && (
                    <div className={cn("p-1.5 rounded-md", card.bgColor || "bg-gray-100")}>
                      {React.cloneElement(card.icon as React.ReactElement, {
                        className: "w-3 h-3"
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};