/**
 * Real-time Status Indicator Component
 * Shows connection status and last update time
 */

import React from 'react';
import { motion } from 'framer-motion';
import { WifiIcon, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface RealtimeIndicatorProps {
  isRealtime: boolean;
  lastFetchTime: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  className?: string;
  showRefreshButton?: boolean;
}

export const RealtimeIndicator: React.FC<RealtimeIndicatorProps> = ({
  isRealtime,
  lastFetchTime,
  isRefreshing,
  onRefresh,
  className = '',
  showRefreshButton = true
}) => {
  // Calculate seconds since last update
  const secondsAgo = lastFetchTime
    ? Math.floor((Date.now() - lastFetchTime.getTime()) / 1000)
    : null;

  // Format time display
  const getTimeDisplay = () => {
    if (!secondsAgo) return '';
    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    const minutes = Math.floor(secondsAgo / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Real-time status indicator */}
      <div className="flex items-center gap-1.5 text-xs">
        <div className="relative">
          <WifiIcon
            className={`h-3.5 w-3.5 transition-colors duration-300 ${
              isRealtime ? 'text-green-500' : 'text-gray-400'
            }`}
          />
          {isRealtime && (
            <motion.div
              className="absolute -top-0.5 -right-0.5"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
            </motion.div>
          )}
        </div>
        <span className={`${isRealtime ? 'text-green-600' : 'text-gray-500'}`}>
          Live
        </span>
        {lastFetchTime && (
          <span className="text-gray-400">
            ({getTimeDisplay()})
          </span>
        )}
      </div>

      {/* Refresh button */}
      {showRefreshButton && (
        <Button
          onClick={onRefresh}
          size="sm"
          variant="outline"
          className="h-8 px-3 text-xs border-gray-200 hover:border-gray-300"
          disabled={isRefreshing}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          <span className="ml-1.5">Refresh</span>
        </Button>
      )}
    </div>
  );
};

/**
 * Floating Real-time Status Badge
 * Can be positioned in corner of screen
 */
export const RealtimeBadge: React.FC<{
  isRealtime: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}> = ({ isRealtime, position = 'bottom-right' }) => {
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4'
  };

  return (
    <motion.div
      className={`fixed ${positionClasses[position]} z-40`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className={`
        px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm
        ${isRealtime
          ? 'bg-green-500/90 text-white'
          : 'bg-gray-500/90 text-white'
        }
      `}>
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <WifiIcon className="h-3.5 w-3.5" />
          <span>{isRealtime ? 'Real-time Active' : 'Real-time Paused'}</span>
          {isRealtime && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default RealtimeIndicator;