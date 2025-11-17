import { useEffect, useRef, useCallback, useState } from 'react';

interface UseAutoSaveOptions {
  data: any;
  onSave: (data: any, isAutoSave: boolean) => Promise<void>;
  interval?: number; // in milliseconds
  localStorageKey?: string;
  enabled?: boolean;
}

interface UseAutoSaveReturn {
  isSaving: boolean;
  lastSaved: Date | null;
  saveNow: () => Promise<void>;
  clearLocalStorage: () => void;
  getLocalStorageData: () => any;
}

/**
 * Custom hook for auto-saving form data with local storage backup
 *
 * @param options - Configuration options
 * @param options.data - The data to be saved
 * @param options.onSave - Callback function to save data (receives data and isAutoSave flag)
 * @param options.interval - Auto-save interval in milliseconds (default: 180000 = 3 minutes)
 * @param options.localStorageKey - Key for localStorage backup
 * @param options.enabled - Whether auto-save is enabled (default: true)
 *
 * @returns Object with saving state, last saved time, and utility functions
 */
export const useAutoSave = ({
  data,
  onSave,
  interval = 180000, // 3 minutes default
  localStorageKey = 'autoSaveData',
  enabled = true,
}: UseAutoSaveOptions): UseAutoSaveReturn => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastDataRef = useRef<string>('');
  const isMountedRef = useRef(true);

  // Save to local storage
  const saveToLocalStorage = useCallback(
    (dataToSave: any) => {
      if (!localStorageKey) return;

      try {
        localStorage.setItem(
          localStorageKey,
          JSON.stringify({
            data: dataToSave,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (error) {
        console.error('Failed to save to localStorage:', error);
      }
    },
    [localStorageKey]
  );

  // Get data from local storage
  const getLocalStorageData = useCallback(() => {
    if (!localStorageKey) return null;

    try {
      const stored = localStorage.getItem(localStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.data;
      }
    } catch (error) {
      console.error('Failed to retrieve from localStorage:', error);
    }
    return null;
  }, [localStorageKey]);

  // Clear local storage
  const clearLocalStorage = useCallback(() => {
    if (!localStorageKey) return;

    try {
      localStorage.removeItem(localStorageKey);
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
    }
  }, [localStorageKey]);

  // Perform save operation
  const performSave = useCallback(
    async (isAutoSave: boolean = true) => {
      if (!enabled || isSaving) return;

      const currentData = JSON.stringify(data);

      // Skip if data hasn't changed
      if (isAutoSave && currentData === lastDataRef.current) {
        console.log('⏭️ Auto-save skipped - no changes detected');
        return;
      }

      console.log('💾 Starting auto-save...', isAutoSave ? '(auto)' : '(manual)');
      setIsSaving(true);

      try {
        // Save to localStorage first (faster, always works)
        saveToLocalStorage(data);
        console.log('✅ Saved to localStorage');

        // Then call the onSave callback
        await onSave(data, isAutoSave);

        if (isMountedRef.current) {
          setLastSaved(new Date());
          lastDataRef.current = currentData;
          console.log('✅ Auto-save completed successfully');
        }
      } catch (error) {
        console.error('❌ Auto-save failed:', error);
        // Data is still in localStorage, so user won't lose it
      } finally {
        if (isMountedRef.current) {
          setIsSaving(false);
        }
      }
    },
    [data, enabled, isSaving, onSave, saveToLocalStorage]
  );

  // Manual save function
  const saveNow = useCallback(async () => {
    await performSave(false);
  }, [performSave]);

  // Set up auto-save interval - triggers performSave which shows toast notification
  useEffect(() => {
    if (!enabled) return;

    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Set new timer - this will trigger the full save with toast notification
    saveTimerRef.current = setTimeout(() => {
      performSave(true);
    }, interval);

    // Cleanup
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [data, enabled, interval, performSave]);

  // Immediate localStorage backup on data change (no toast, just silent backup)
  // This ensures data is never lost even if browser crashes before the interval timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!enabled) return;

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Save to localStorage after 500ms of no changes (debounced)
    debounceTimerRef.current = setTimeout(() => {
      const currentData = JSON.stringify(data);
      // Only save if data has actually changed
      if (currentData !== lastDataRef.current) {
        saveToLocalStorage(data);
        console.log('💾 Silent localStorage backup completed');
      }
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [data, enabled, saveToLocalStorage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  return {
    isSaving,
    lastSaved,
    saveNow,
    clearLocalStorage,
    getLocalStorageData,
  };
};
