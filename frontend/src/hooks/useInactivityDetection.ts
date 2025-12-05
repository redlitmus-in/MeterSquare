import { useEffect, useRef, useCallback, useState } from 'react';

interface UseInactivityDetectionOptions {
  timeout?: number; // in milliseconds
  onInactive?: () => void;
  enabled?: boolean;
  events?: string[];
}

interface UseInactivityDetectionReturn {
  isInactive: boolean;
  resetTimer: () => void;
  remainingTime: number;
}

/**
 * Custom hook for detecting user inactivity
 *
 * @param options - Configuration options
 * @param options.timeout - Inactivity timeout in milliseconds (default: 7200000 = 2 hours)
 * @param options.onInactive - Callback function when user becomes inactive
 * @param options.enabled - Whether inactivity detection is enabled (default: true)
 * @param options.events - Array of events to listen for (default: mouse/keyboard events)
 *
 * @returns Object with inactivity state, reset function, and remaining time
 */
export const useInactivityDetection = ({
  timeout = 7200000, // 2 hours default
  onInactive,
  enabled = true,
  events = [
    'mousedown',
    'mousemove',
    'keypress',
    'scroll',
    'touchstart',
    'click',
  ],
}: UseInactivityDetectionOptions): UseInactivityDetectionReturn => {
  const [isInactive, setIsInactive] = useState(false);
  const [remainingTime, setRemainingTime] = useState(timeout);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Reset the inactivity timer
  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsInactive(false);
    setRemainingTime(timeout);

    console.log('🔄 Inactivity timer reset');

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    if (enabled) {
      timeoutRef.current = setTimeout(() => {
        console.log('⏰ INACTIVITY TIMEOUT REACHED');
        setIsInactive(true);
        if (onInactive) {
          onInactive();
        }
      }, timeout);
    }
  }, [enabled, timeout, onInactive]);

  // Update remaining time every second
  useEffect(() => {
    if (!enabled) return;

    updateIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, timeout - elapsed);
      setRemainingTime(remaining);

      if (remaining === 0) {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
        }
      }
    }, 1000);

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [enabled, timeout]);

  // Set up event listeners
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Initialize timer
    resetTimer();

    // Add event listeners for user activity
    const handleActivity = () => {
      resetTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up inactivity detection');
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [enabled, events, resetTimer, timeout]);

  return {
    isInactive,
    resetTimer,
    remainingTime,
  };
};
